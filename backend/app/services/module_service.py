"""
Service de gestion des modules OpsFlux.

Responsabilités:
- Installation/désinstallation de modules
- Activation/désactivation
- Validation des dépendances
- Enregistrement des permissions, menus, hooks, traductions, préférences, settings
- Mise à jour de modules
"""

import os
import json
import shutil
import zipfile
import tempfile
import subprocess
from pathlib import Path
from typing import Optional
from datetime import datetime
from uuid import UUID

from sqlmodel import Session, select, func
from fastapi import HTTPException

from app.models import User
from app.models_modules import (
    Module,
    ModuleStatus,
    ModuleRegistry,
    ModulePermission,
    ModuleMenuItem,
    ModuleHook,
    ModuleDependency,
)
from app.models_rbac import Permission
from app.models_hooks import Hook


class ModuleValidationError(Exception):
    """Erreur de validation de module"""
    pass


class ModuleManager:
    """
    Gestionnaire de modules OpsFlux.

    Un module OpsFlux est auto-déclaratif via son manifest.json.
    Il déclare ses permissions, menus, hooks, traductions, préférences et exploite
    les services CORE (notification, email, file_manager, audit, translation, etc.)
    """

    # Dossier de base des modules (à la racine du projet)
    MODULES_DIR = Path("/modules")

    # Les modules restent dans /modules/ et ne sont PAS copiés ailleurs
    # Le chargement dynamique se fait directement depuis /modules/{code}/backend/

    @staticmethod
    def discover_modules(session: Session) -> list[Module]:
        """
        Découvre tous les modules installés sur le système.
        Scanne le dossier /modules/ et met à jour la base de données.

        Returns:
            Liste des modules découverts
        """
        discovered_modules = []

        if not ModuleManager.MODULES_DIR.exists():
            return discovered_modules

        # Scanner tous les dossiers de modules
        for module_dir in ModuleManager.MODULES_DIR.iterdir():
            if not module_dir.is_dir():
                continue

            manifest_path = module_dir / "manifest.json"
            if not manifest_path.exists():
                continue

            try:
                # Charger le manifest
                with open(manifest_path, 'r') as f:
                    manifest = json.load(f)

                # Vérifier si le module existe déjà en DB
                statement = select(Module).where(Module.code == manifest['code'])
                existing_module = session.exec(statement).first()

                if not existing_module:
                    # Créer le module en DB
                    module = Module(
                        name=manifest['name'],
                        code=manifest['code'],
                        slug=manifest.get('slug', manifest['code']),
                        version=manifest['version'],
                        description=manifest.get('description'),
                        author=manifest.get('author'),
                        license=manifest.get('license'),
                        icon=manifest.get('icon', 'Package'),
                        category=manifest.get('category', 'other'),
                        status=ModuleStatus.INSTALLED,
                        manifest=manifest,
                        backend_path=str(module_dir / "backend"),
                        frontend_path=str(module_dir / "frontend"),
                    )
                    session.add(module)
                    session.commit()
                    session.refresh(module)
                    discovered_modules.append(module)
                else:
                    discovered_modules.append(existing_module)

            except Exception as e:
                print(f"Error loading module from {module_dir}: {e}")
                continue

        return discovered_modules

    @staticmethod
    def validate_manifest(manifest: dict) -> None:
        """
        Valide la structure d'un manifest de module.

        Structure complète attendue:
        {
            "name": "HSE Reports",
            "code": "hse",
            "version": "1.0.0",
            "description": "...",
            "permissions": [...],
            "menu_items": [...],
            "hooks": [...],
            "translations": {...},
            "user_preferences": [...],
            "settings": [...],
            "dependencies": {
                "core_services": [...],
                "modules": [...]
            }
        }

        Args:
            manifest: Dictionnaire du manifest

        Raises:
            ModuleValidationError: Si le manifest est invalide
        """
        required_fields = ['name', 'code', 'version']
        for field in required_fields:
            if field not in manifest:
                raise ModuleValidationError(f"Missing required field: {field}")

        # Valider le format de version (semver)
        version = manifest['version']
        parts = version.split('.')
        if len(parts) != 3:
            raise ModuleValidationError(f"Invalid version format: {version}. Expected: X.Y.Z")

        try:
            for part in parts:
                int(part)
        except ValueError:
            raise ModuleValidationError(f"Invalid version format: {version}")

        # Valider le code (alphanumeric + underscore uniquement)
        code = manifest['code']
        if not code.replace('_', '').isalnum():
            raise ModuleValidationError(f"Invalid code: {code}. Only alphanumeric and underscore allowed")

    @staticmethod
    def validate_dependencies(session: Session, manifest: dict) -> tuple[bool, list[str]]:
        """
        Vérifie que toutes les dépendances sont satisfaites.

        Args:
            session: Session DB
            manifest: Manifest du module

        Returns:
            Tuple (is_valid, errors)
        """
        errors = []

        dependencies = manifest.get('dependencies', {})

        # Vérifier les services CORE requis
        core_services = dependencies.get('core_services', [])
        # Services CORE disponibles (à compléter selon implémentation)
        available_core_services = [
            'notification', 'email', 'file_manager', 'audit', 'translation',
            'user_preference', 'settings', 'hook', 'permission', 'menu'
        ]

        for service in core_services:
            if service not in available_core_services:
                errors.append(f"Required CORE service not available: {service}")

        # Vérifier les modules requis
        required_modules = dependencies.get('modules', [])
        for required in required_modules:
            module_code = required['code']
            min_version = required.get('min_version')

            statement = select(Module).where(
                Module.code == module_code,
                Module.status.in_([ModuleStatus.ACTIVE, ModuleStatus.INSTALLED])
            )
            module = session.exec(statement).first()

            if not module:
                errors.append(f"Required module not found: {module_code}")
                continue

            if min_version:
                # Comparer les versions (simple string comparison for now)
                if module.version < min_version:
                    errors.append(
                        f"Module {module_code} version {module.version} is too old. "
                        f"Required: {min_version}"
                    )

        return len(errors) == 0, errors

    @staticmethod
    def _register_translations(session: Session, module: Module, translations: dict):
        """
        Enregistre les traductions du module dans le service CORE Translation.

        Args:
            session: Session DB
            module: Module
            translations: Dict {"fr": {...}, "en": {...}}
        """
        # TODO: Intégrer avec TranslationService CORE
        # Pour l'instant, on stocke dans le manifest
        pass

    @staticmethod
    def _register_user_preferences(session: Session, module: Module, preferences: list):
        """
        Enregistre les préférences utilisateur du module dans le service CORE UserPreference.

        Args:
            session: Session DB
            module: Module
            preferences: Liste de préférences [{key, label, type, default, category}, ...]
        """
        # TODO: Intégrer avec UserPreferenceService CORE
        # Pour l'instant, on stocke dans le manifest
        pass

    @staticmethod
    def _register_settings(session: Session, module: Module, settings: list):
        """
        Enregistre les settings système du module dans le service CORE Settings.

        Args:
            session: Session DB
            module: Module
            settings: Liste de settings [{key, label, type, default, category}, ...]
        """
        # TODO: Intégrer avec SettingsService CORE
        # Pour l'instant, on stocke dans le manifest
        pass

    @staticmethod
    def install_module(
        session: Session,
        zip_file_path: str,
        installed_by: User
    ) -> Module:
        """
        Installe un module depuis un fichier ZIP.

        Séquence complète:
        1. Extraire le ZIP dans un dossier temporaire
        2. Valider le manifest
        3. Vérifier les dépendances
        4. Copier les fichiers vers /modules/{code}/
        5. Installer les packages Python (si requirements.txt)
        6. Créer l'enregistrement Module en DB
        7. Enregistrer les permissions (module_permission + permission CORE)
        8. Enregistrer les items de menu (module_menu_item)
        9. Enregistrer les hooks (module_hook + hook CORE)
        10. Enregistrer les traductions (service Translation CORE)
        11. Enregistrer les préférences utilisateur (service UserPreference CORE)
        12. Enregistrer les settings système (service Settings CORE)
        13. Enregistrer les dépendances (module_dependency)
        14. Marquer le module comme installé

        Args:
            session: Session DB
            zip_file_path: Chemin vers le fichier ZIP
            installed_by: Utilisateur qui installe

        Returns:
            Module installé

        Raises:
            ModuleValidationError: Si la validation échoue
            HTTPException: Si l'installation échoue
        """
        temp_dir = None
        module_dir = None

        try:
            # 1. Extraire le ZIP
            temp_dir = tempfile.mkdtemp(prefix="module_install_")
            with zipfile.ZipFile(zip_file_path, 'r') as zip_ref:
                zip_ref.extractall(temp_dir)

            # 2. Charger et valider le manifest
            manifest_path = Path(temp_dir) / "manifest.json"
            if not manifest_path.exists():
                raise ModuleValidationError("manifest.json not found in module archive")

            with open(manifest_path, 'r') as f:
                manifest = json.load(f)

            ModuleManager.validate_manifest(manifest)

            # 3. Vérifier que le module n'existe pas déjà
            statement = select(Module).where(Module.code == manifest['code'])
            existing_module = session.exec(statement).first()
            if existing_module:
                raise HTTPException(
                    status_code=400,
                    detail=f"Module {manifest['code']} is already installed"
                )

            # 4. Vérifier les dépendances
            deps_valid, dep_errors = ModuleManager.validate_dependencies(session, manifest)
            if not deps_valid:
                raise ModuleValidationError(f"Dependency errors: {', '.join(dep_errors)}")

            # 5. Copier les fichiers vers /modules/
            module_dir = ModuleManager.MODULES_DIR / manifest['code']
            if module_dir.exists():
                shutil.rmtree(module_dir)

            ModuleManager.MODULES_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copytree(temp_dir, module_dir)

            # 6. Installer les packages Python (si requirements.txt existe)
            requirements_path = module_dir / "requirements.txt"
            if requirements_path.exists():
                subprocess.run(
                    ["pip", "install", "-r", str(requirements_path)],
                    check=True,
                    capture_output=True
                )

            # 7. Créer le module en DB
            module = Module(
                name=manifest['name'],
                code=manifest['code'],
                slug=manifest.get('slug', manifest['code']),
                version=manifest['version'],
                description=manifest.get('description'),
                long_description=manifest.get('long_description'),
                author=manifest.get('author'),
                author_email=manifest.get('author_email'),
                license=manifest.get('license'),
                homepage_url=manifest.get('homepage_url'),
                documentation_url=manifest.get('documentation_url'),
                repository_url=manifest.get('repository_url'),
                icon=manifest.get('icon', 'Package'),
                color=manifest.get('color', '#3B82F6'),
                category=manifest.get('category', 'other'),
                status=ModuleStatus.INSTALLED,
                installed_at=datetime.utcnow(),
                installed_by_id=installed_by.id,
                manifest=manifest,
                config={},
                backend_path=str(module_dir / "backend") if (module_dir / "backend").exists() else None,
                frontend_path=str(module_dir / "frontend") if (module_dir / "frontend").exists() else None,
                is_system=manifest.get('is_system', False),
                is_required=manifest.get('is_required', False),
                requires_license=manifest.get('requires_license', False),
            )

            session.add(module)
            session.commit()
            session.refresh(module)

            # 8. Enregistrer les permissions
            permissions_data = manifest.get('permissions', [])
            for perm in permissions_data:
                # Créer dans module_permission
                module_permission = ModulePermission(
                    module_id=module.id,
                    code=perm['code'],
                    name=perm['name'],
                    description=perm.get('description'),
                    category=perm.get('category', 'general'),
                    created_by_id=installed_by.id,
                )
                session.add(module_permission)

                # Créer aussi dans la table Permission principale (CORE)
                existing_perm = session.exec(select(Permission).where(Permission.code == perm['code'])).first()
                if not existing_perm:
                    permission = Permission(
                        code=perm['code'],
                        name=perm['name'],
                        description=perm.get('description'),
                        module=module.code,  # Ajouter le code du module
                        category=perm.get('category', 'general'),
                        created_by_id=installed_by.id,
                    )
                    session.add(permission)

            # 9. Enregistrer les items de menu
            menu_items_data = manifest.get('menu_items', [])
            for menu_item in menu_items_data:
                module_menu = ModuleMenuItem(
                    module_id=module.id,
                    label=menu_item['label'],
                    route=menu_item['route'],
                    icon=menu_item.get('icon'),
                    parent_id=None,  # TODO: Gérer la hiérarchie
                    order=menu_item.get('order', 0),
                    permission_code=menu_item.get('permission'),
                    badge_source=menu_item.get('badge_source'),
                    is_active=True,
                    created_by_id=installed_by.id,
                )
                session.add(module_menu)

            # 10. Enregistrer les hooks
            hooks_data = manifest.get('hooks', [])
            for hook_data in hooks_data:
                # Créer dans module_hook
                module_hook = ModuleHook(
                    module_id=module.id,
                    name=hook_data.get('name', f"Hook {hook_data['event']}"),
                    event=hook_data['event'],
                    is_active=hook_data.get('is_active', False),  # Inactif par défaut
                    priority=hook_data.get('priority', 0),
                    conditions=hook_data.get('conditions'),
                    actions=hook_data.get('actions', []),
                    created_by_id=installed_by.id,
                )
                session.add(module_hook)

                # Créer aussi dans la table Hook principale (CORE)
                hook = Hook(
                    name=hook_data.get('name', f"Hook {hook_data['event']} - {module.name}"),
                    event=hook_data['event'],
                    is_active=hook_data.get('is_active', False),
                    priority=hook_data.get('priority', 0),
                    description=hook_data.get('description', f"Hook from module {module.name}"),
                    conditions=hook_data.get('conditions'),
                    actions=hook_data.get('actions', []),
                    created_by_id=installed_by.id,
                )
                session.add(hook)

            # 11. Enregistrer les traductions
            translations = manifest.get('translations', {})
            if translations:
                ModuleManager._register_translations(session, module, translations)

            # 12. Enregistrer les préférences utilisateur
            user_preferences = manifest.get('user_preferences', [])
            if user_preferences:
                ModuleManager._register_user_preferences(session, module, user_preferences)

            # 13. Enregistrer les settings système
            settings = manifest.get('settings', [])
            if settings:
                ModuleManager._register_settings(session, module, settings)

            # 14. Enregistrer les dépendances
            dependencies = manifest.get('dependencies', {}).get('modules', [])
            for dep in dependencies:
                dep_module = session.exec(
                    select(Module).where(Module.code == dep['code'])
                ).first()

                if dep_module:
                    module_dep = ModuleDependency(
                        module_id=module.id,
                        required_module_id=dep_module.id,
                        min_version=dep.get('min_version'),
                        is_optional=dep.get('is_optional', False),
                    )
                    session.add(module_dep)

            session.commit()
            session.refresh(module)

            return module

        except ModuleValidationError as e:
            # Rollback filesystem
            if module_dir and module_dir.exists():
                shutil.rmtree(module_dir)
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            # Rollback filesystem
            if module_dir and module_dir.exists():
                shutil.rmtree(module_dir)
            raise HTTPException(status_code=500, detail=f"Installation failed: {str(e)}")
        finally:
            # Nettoyer le dossier temporaire
            if temp_dir and os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)

    @staticmethod
    def activate_module(session: Session, module_id: UUID, activated_by: User) -> Module:
        """
        Active un module installé.

        Activation = rendre fonctionnel:
        - Change status vers ACTIVE
        - Active les hooks du module dans le système CORE
        - Les menus, permissions deviennent accessibles

        Args:
            session: Session DB
            module_id: ID du module
            activated_by: Utilisateur qui active

        Returns:
            Module activé

        Raises:
            HTTPException: Si l'activation échoue
        """
        module = session.get(Module, module_id)
        if not module:
            raise HTTPException(status_code=404, detail="Module not found")

        if module.status == ModuleStatus.ACTIVE:
            raise HTTPException(status_code=400, detail="Module is already active")

        if module.status not in [ModuleStatus.INSTALLED, ModuleStatus.DISABLED]:
            raise HTTPException(
                status_code=400,
                detail=f"Module must be installed or disabled before activation. Current status: {module.status}"
            )

        # Vérifier les dépendances
        deps_valid, dep_errors = ModuleManager.validate_dependencies(session, module.manifest)
        if not deps_valid:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot activate: {', '.join(dep_errors)}"
            )

        # Activer le module
        module.status = ModuleStatus.ACTIVE
        module.activated_at = datetime.utcnow()
        module.updated_by_id = activated_by.id

        # Activer les hooks du module dans le système CORE
        statement = select(ModuleHook).where(ModuleHook.module_id == module_id)
        module_hooks = session.exec(statement).all()
        for module_hook in module_hooks:
            # Trouver le hook correspondant dans la table Hook CORE
            hook_statement = select(Hook).where(
                Hook.event == module_hook.event,
                Hook.name.like(f"%{module.name}%")
            )
            hook = session.exec(hook_statement).first()
            if hook and module_hook.is_active:
                hook.is_active = True

        session.commit()
        session.refresh(module)

        return module

    @staticmethod
    def deactivate_module(session: Session, module_id: UUID, deactivated_by: User) -> Module:
        """
        Désactive un module actif.

        Désactivation = rendre inactif:
        - Change status vers DISABLED
        - Désactive les hooks du module dans le système CORE
        - Les menus restent visibles mais grisés

        Args:
            session: Session DB
            module_id: ID du module
            deactivated_by: Utilisateur qui désactive

        Returns:
            Module désactivé

        Raises:
            HTTPException: Si la désactivation échoue
        """
        module = session.get(Module, module_id)
        if not module:
            raise HTTPException(status_code=404, detail="Module not found")

        if module.is_required:
            raise HTTPException(status_code=400, detail="Cannot deactivate required module")

        if module.status != ModuleStatus.ACTIVE:
            raise HTTPException(status_code=400, detail="Module is not active")

        # Vérifier si d'autres modules actifs dépendent de celui-ci
        statement = select(ModuleDependency).where(
            ModuleDependency.required_module_id == module_id,
            ModuleDependency.is_optional == False
        )
        dependencies = session.exec(statement).all()

        active_dependents = []
        for dep in dependencies:
            dep_module = session.get(Module, dep.module_id)
            if dep_module and dep_module.status == ModuleStatus.ACTIVE:
                active_dependents.append(dep_module.name)

        if active_dependents:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot deactivate: required by active modules: {', '.join(active_dependents)}"
            )

        # Désactiver le module
        module.status = ModuleStatus.DISABLED
        module.deactivated_at = datetime.utcnow()
        module.updated_by_id = deactivated_by.id

        # Désactiver les hooks du module dans le système CORE
        statement = select(Hook).where(Hook.name.like(f"%{module.name}%"))
        hooks = session.exec(statement).all()
        for hook in hooks:
            hook.is_active = False

        session.commit()
        session.refresh(module)

        return module

    @staticmethod
    def uninstall_module(session: Session, module_id: UUID, uninstalled_by: User) -> None:
        """
        Désinstalle un module complètement.

        ATTENTION: Opération DESTRUCTIVE et IRRÉVERSIBLE!
        - Supprime les fichiers du module (/modules/{code}/)
        - Supprime toutes les données en DB (permissions, menus, hooks)
        - Supprime les traductions, préférences, settings du module

        Args:
            session: Session DB
            module_id: ID du module
            uninstalled_by: Utilisateur qui désinstalle

        Raises:
            HTTPException: Si la désinstallation échoue
        """
        module = session.get(Module, module_id)
        if not module:
            raise HTTPException(status_code=404, detail="Module not found")

        if module.is_system or module.is_required:
            raise HTTPException(status_code=400, detail="Cannot uninstall system or required module")

        # Vérifier les dépendances (aucun module ne doit dépendre de celui-ci)
        statement = select(ModuleDependency).where(
            ModuleDependency.required_module_id == module_id,
            ModuleDependency.is_optional == False
        )
        dependencies = session.exec(statement).all()

        if dependencies:
            dependent_modules = [
                session.get(Module, dep.module_id).name
                for dep in dependencies
            ]
            raise HTTPException(
                status_code=400,
                detail=f"Cannot uninstall: required by modules: {', '.join(dependent_modules)}"
            )

        try:
            # Supprimer les hooks du système CORE
            statement = select(Hook).where(Hook.name.like(f"%{module.name}%"))
            hooks = session.exec(statement).all()
            for hook in hooks:
                session.delete(hook)

            # Supprimer les permissions du système CORE
            statement = select(ModulePermission).where(ModulePermission.module_id == module_id)
            permissions = session.exec(statement).all()
            for perm in permissions:
                # Supprimer aussi de la table Permission principale
                perm_statement = select(Permission).where(Permission.code == perm.code)
                permission = session.exec(perm_statement).first()
                if permission:
                    session.delete(permission)
                session.delete(perm)

            # Supprimer les menus
            statement = select(ModuleMenuItem).where(ModuleMenuItem.module_id == module_id)
            menus = session.exec(statement).all()
            for menu in menus:
                session.delete(menu)

            # Supprimer les hooks du module
            statement = select(ModuleHook).where(ModuleHook.module_id == module_id)
            module_hooks = session.exec(statement).all()
            for module_hook in module_hooks:
                session.delete(module_hook)

            # Supprimer les dépendances
            statement = select(ModuleDependency).where(ModuleDependency.module_id == module_id)
            deps = session.exec(statement).all()
            for dep in deps:
                session.delete(dep)

            # TODO: Supprimer les traductions du service CORE
            # TODO: Supprimer les préférences utilisateur du service CORE
            # TODO: Supprimer les settings du service CORE

            # Supprimer les fichiers du module
            module_dir = ModuleManager.MODULES_DIR / module.code
            if module_dir.exists():
                shutil.rmtree(module_dir)

            # Supprimer le module de la DB
            session.delete(module)
            session.commit()

        except Exception as e:
            session.rollback()
            raise HTTPException(status_code=500, detail=f"Uninstall failed: {str(e)}")

    @staticmethod
    def get_active_modules(session: Session) -> list[Module]:
        """
        Retourne la liste des modules activés.

        Args:
            session: Session DB

        Returns:
            Liste des modules avec status ACTIVE
        """
        statement = select(Module).where(Module.status == ModuleStatus.ACTIVE)
        return list(session.exec(statement).all())

    @staticmethod
    def get_module_stats(session: Session) -> dict:
        """
        Retourne des statistiques sur les modules.

        Returns:
            Dictionnaire avec les stats
        """
        total = session.exec(select(func.count()).select_from(Module)).one()
        active = session.exec(
            select(func.count()).select_from(Module).where(Module.status == ModuleStatus.ACTIVE)
        ).one()
        installed = session.exec(
            select(func.count()).select_from(Module).where(Module.status == ModuleStatus.INSTALLED)
        ).one()
        disabled = session.exec(
            select(func.count()).select_from(Module).where(Module.status == ModuleStatus.DISABLED)
        ).one()

        return {
            "total": total,
            "active": active,
            "installed": installed,
            "disabled": disabled,
            "available": total - active - installed - disabled,
        }
