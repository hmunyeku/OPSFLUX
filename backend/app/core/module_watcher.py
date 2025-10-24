"""
Module Watcher - Système de détection automatique des modules

Ce service surveille le dossier /modules/ et détecte automatiquement:
- Nouveaux modules ajoutés
- Modules supprimés
- Modifications de manifest.json

Le hot reload des routes est appliqué automatiquement.
"""

import os
import json
import logging
import threading
import time
from pathlib import Path
from typing import Dict, Set, Optional, Callable
from datetime import datetime

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileCreatedEvent, FileDeletedEvent, FileModifiedEvent

logger = logging.getLogger(__name__)


class ModuleDirectoryHandler(FileSystemEventHandler):
    """
    Handler pour les événements du système de fichiers dans /modules/
    """

    def __init__(
        self,
        on_module_added: Optional[Callable] = None,
        on_module_removed: Optional[Callable] = None,
        on_module_updated: Optional[Callable] = None,
    ):
        self.on_module_added = on_module_added
        self.on_module_removed = on_module_removed
        self.on_module_updated = on_module_updated
        self._last_events: Dict[str, float] = {}  # Pour éviter les doublons
        self._debounce_delay = 2.0  # 2 secondes de délai anti-rebond

    def _should_process_event(self, path: str) -> bool:
        """Vérifie si l'événement doit être traité (anti-rebond)"""
        now = time.time()
        last_time = self._last_events.get(path, 0)

        if now - last_time < self._debounce_delay:
            return False

        self._last_events[path] = now
        return True

    def on_created(self, event):
        """Appelé quand un fichier/dossier est créé"""
        if event.is_directory:
            # Nouveau dossier de module
            module_path = Path(event.src_path)
            manifest_path = module_path / "manifest.json"

            # Attendre que le manifest soit créé
            time.sleep(1)
            if manifest_path.exists():
                if self._should_process_event(event.src_path):
                    logger.info(f"📦 Nouveau module détecté: {module_path.name}")
                    if self.on_module_added:
                        self.on_module_added(module_path)
        else:
            # Fichier manifest.json créé
            if event.src_path.endswith("manifest.json"):
                module_path = Path(event.src_path).parent
                if self._should_process_event(event.src_path):
                    logger.info(f"📦 Manifest créé pour: {module_path.name}")
                    if self.on_module_added:
                        self.on_module_added(module_path)

    def on_deleted(self, event):
        """Appelé quand un fichier/dossier est supprimé"""
        if event.is_directory:
            module_path = Path(event.src_path)
            if self._should_process_event(event.src_path):
                logger.info(f"🗑️  Module supprimé: {module_path.name}")
                if self.on_module_removed:
                    self.on_module_removed(module_path)

    def on_modified(self, event):
        """Appelé quand un fichier est modifié"""
        if not event.is_directory and event.src_path.endswith("manifest.json"):
            module_path = Path(event.src_path).parent
            if self._should_process_event(event.src_path):
                logger.info(f"🔄 Manifest modifié: {module_path.name}")
                if self.on_module_updated:
                    self.on_module_updated(module_path)


class ModuleWatcher:
    """
    Service de surveillance des modules pour le hot reload automatique
    """

    def __init__(self, modules_dir: Path = Path("/modules")):
        self.modules_dir = modules_dir
        self.observer: Optional[Observer] = None
        self._running = False
        self._known_modules: Set[str] = set()

        # Callbacks
        self._on_module_added_callbacks = []
        self._on_module_removed_callbacks = []
        self._on_module_updated_callbacks = []

    def register_callbacks(
        self,
        on_added: Optional[Callable] = None,
        on_removed: Optional[Callable] = None,
        on_updated: Optional[Callable] = None,
    ):
        """Enregistre les callbacks pour les événements de modules"""
        if on_added:
            self._on_module_added_callbacks.append(on_added)
        if on_removed:
            self._on_module_removed_callbacks.append(on_removed)
        if on_updated:
            self._on_module_updated_callbacks.append(on_updated)

    def _trigger_added(self, module_path: Path):
        """Déclenche les callbacks d'ajout de module"""
        for callback in self._on_module_added_callbacks:
            try:
                callback(module_path)
            except Exception as e:
                logger.error(f"Error in module_added callback: {e}")

    def _trigger_removed(self, module_path: Path):
        """Déclenche les callbacks de suppression de module"""
        for callback in self._on_module_removed_callbacks:
            try:
                callback(module_path)
            except Exception as e:
                logger.error(f"Error in module_removed callback: {e}")

    def _trigger_updated(self, module_path: Path):
        """Déclenche les callbacks de mise à jour de module"""
        for callback in self._on_module_updated_callbacks:
            try:
                callback(module_path)
            except Exception as e:
                logger.error(f"Error in module_updated callback: {e}")

    def scan_existing_modules(self):
        """Scanne les modules existants au démarrage"""
        if not self.modules_dir.exists():
            logger.warning(f"Modules directory not found: {self.modules_dir}")
            return

        for module_dir in self.modules_dir.iterdir():
            if not module_dir.is_dir():
                continue

            manifest_path = module_dir / "manifest.json"
            if manifest_path.exists():
                self._known_modules.add(module_dir.name)
                logger.debug(f"Found existing module: {module_dir.name}")

    def start(self):
        """Démarre la surveillance des modules"""
        if self._running:
            logger.warning("Module watcher already running")
            return

        if not self.modules_dir.exists():
            logger.warning(f"Creating modules directory: {self.modules_dir}")
            self.modules_dir.mkdir(parents=True, exist_ok=True)

        # Scanner les modules existants
        self.scan_existing_modules()

        # Créer le handler
        event_handler = ModuleDirectoryHandler(
            on_module_added=self._trigger_added,
            on_module_removed=self._trigger_removed,
            on_module_updated=self._trigger_updated,
        )

        # Créer et démarrer l'observateur
        self.observer = Observer()
        self.observer.schedule(event_handler, str(self.modules_dir), recursive=False)
        self.observer.start()
        self._running = True

        logger.info(f"🔍 Module watcher started - monitoring {self.modules_dir}")

    def stop(self):
        """Arrête la surveillance des modules"""
        if not self._running:
            return

        if self.observer:
            self.observer.stop()
            self.observer.join()
            self.observer = None

        self._running = False
        logger.info("🛑 Module watcher stopped")

    def is_running(self) -> bool:
        """Retourne True si le watcher est actif"""
        return self._running


# Instance globale du watcher
module_watcher = ModuleWatcher()
