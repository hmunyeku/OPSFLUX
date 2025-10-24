"""
Module Hot Reload Service

Gère le chargement dynamique des modules sans redémarrage:
- Découverte automatique via module_watcher
- Chargement/déchargement des routes FastAPI
- Synchronisation avec la base de données
- Invalidation du cache
"""

import json
import logging
from pathlib import Path
from typing import Optional
from datetime import datetime

from fastapi import FastAPI

from app.core.module_loader import ModuleLoader
from app.core.module_watcher import module_watcher

logger = logging.getLogger(__name__)


class ModuleHotReloadService:
    """
    Service de hot reload pour les modules
    """

    def __init__(self, app: Optional[FastAPI] = None):
        self.app = app
        self._db_session = None

    def set_app(self, app: FastAPI):
        """Définit l'instance FastAPI"""
        self.app = app

    def set_db_session(self, session):
        """Définit la session DB (pour l'utiliser dans les callbacks)"""
        self._db_session = session

    def get_module_code_from_path(self, module_path: Path) -> Optional[str]:
        """Extrait le code du module depuis son manifest"""
        try:
            manifest_path = module_path / "manifest.json"
            if manifest_path.exists():
                with open(manifest_path, 'r', encoding='utf-8') as f:
                    manifest = json.load(f)
                    return manifest.get('code')
        except Exception as e:
            logger.error(f"Error reading manifest from {module_path}: {e}")
        return None

    def handle_module_added(self, module_path: Path):
        """
        Callback appelé quand un nouveau module est détecté

        Actions:
        1. Ajouter le module en DB (via discover_modules)
        2. Charger les routes si le module est actif
        3. Invalider le cache des modules
        """
        logger.info(f"🚀 Hot reload: Adding module from {module_path}")

        module_code = self.get_module_code_from_path(module_path)
        if not module_code:
            logger.error(f"Could not extract module code from {module_path}")
            return

        try:
            # Si on a une session DB, découvrir et enregistrer le module
            if self._db_session:
                from app.services.module_service import ModuleManager
                modules = ModuleManager.discover_modules(self._db_session)
                logger.info(f"  ✓ Module {module_code} discovered and registered in DB")

                # Vérifier si le module est actif
                from app.models_modules import Module, ModuleStatus
                from sqlmodel import select

                statement = select(Module).where(
                    Module.code == module_code,
                    Module.status == ModuleStatus.ACTIVE
                )
                active_module = self._db_session.exec(statement).first()

                if active_module and self.app:
                    # Charger les routes
                    router = ModuleLoader.load_module_router(module_code, app=self.app)
                    if router:
                        logger.info(f"  ✓ Routes loaded for {module_code}")

            # Invalider le cache
            self._invalidate_cache()

        except Exception as e:
            logger.error(f"Error adding module {module_code}: {e}")
            import traceback
            traceback.print_exc()

    def handle_module_removed(self, module_path: Path):
        """
        Callback appelé quand un module est supprimé

        Actions:
        1. Décharger les routes du module
        2. Marquer le module comme supprimé en DB (soft delete)
        3. Invalider le cache
        """
        module_code = module_path.name  # Le nom du dossier
        logger.info(f"🗑️  Hot reload: Removing module {module_code}")

        try:
            # Décharger le router
            if self.app:
                ModuleLoader.unload_module_router(module_code, app=self.app)
                logger.info(f"  ✓ Routes unloaded for {module_code}")

            # Marquer comme supprimé en DB
            if self._db_session:
                from app.models_modules import Module
                from sqlmodel import select

                statement = select(Module).where(Module.code == module_code)
                module = self._db_session.exec(statement).first()

                if module:
                    module.deleted_at = datetime.utcnow()
                    self._db_session.add(module)
                    self._db_session.commit()
                    logger.info(f"  ✓ Module {module_code} marked as deleted in DB")

            # Invalider le cache
            self._invalidate_cache()

        except Exception as e:
            logger.error(f"Error removing module {module_code}: {e}")

    def handle_module_updated(self, module_path: Path):
        """
        Callback appelé quand un module est modifié (manifest.json)

        Actions:
        1. Recharger le module en DB
        2. Recharger les routes si actif
        3. Invalider le cache
        """
        module_code = self.get_module_code_from_path(module_path)
        if not module_code:
            return

        logger.info(f"🔄 Hot reload: Updating module {module_code}")

        try:
            # Recharger le module en DB
            if self._db_session:
                from app.services.module_service import ModuleManager
                from app.models_modules import Module, ModuleStatus
                from sqlmodel import select

                # Re-découvrir le module (met à jour les infos)
                ModuleManager.discover_modules(self._db_session)

                # Vérifier si actif
                statement = select(Module).where(
                    Module.code == module_code,
                    Module.status == ModuleStatus.ACTIVE
                )
                active_module = self._db_session.exec(statement).first()

                if active_module and self.app:
                    # Décharger puis recharger les routes
                    ModuleLoader.unload_module_router(module_code, app=self.app)
                    router = ModuleLoader.load_module_router(module_code, app=self.app)
                    if router:
                        logger.info(f"  ✓ Routes reloaded for {module_code}")

            # Invalider le cache
            self._invalidate_cache()

        except Exception as e:
            logger.error(f"Error updating module {module_code}: {e}")

    def _invalidate_cache(self):
        """Invalide le cache des modules"""
        try:
            from app.core.cache_service import cache_service
            import asyncio

            # Créer une coroutine pour l'invalidation asynchrone
            async def clear_cache():
                await cache_service.clear_namespace("modules")

            # Exécuter dans un nouveau event loop si nécessaire
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    # Créer une tâche dans le loop existant
                    asyncio.create_task(clear_cache())
                else:
                    loop.run_until_complete(clear_cache())
            except RuntimeError:
                # Pas de loop, en créer un nouveau
                asyncio.run(clear_cache())

            logger.debug("  ✓ Module cache invalidated")
        except Exception as e:
            logger.warning(f"Could not invalidate cache: {e}")

    def start_watching(self):
        """Démarre la surveillance des modules avec hot reload"""
        logger.info("🔥 Starting module hot reload service...")

        # Enregistrer les callbacks
        module_watcher.register_callbacks(
            on_added=self.handle_module_added,
            on_removed=self.handle_module_removed,
            on_updated=self.handle_module_updated,
        )

        # Démarrer le watcher
        module_watcher.start()

        logger.info("✅ Module hot reload service started")

    def stop_watching(self):
        """Arrête la surveillance"""
        logger.info("Stopping module hot reload service...")
        module_watcher.stop()


# Instance globale
hot_reload_service = ModuleHotReloadService()
