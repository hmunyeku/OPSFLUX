"""
Module Loader - CORE Service

Ce service est responsable de :
1. Découvrir les modules disponibles dans /modules/
2. Valider l'intégrité des modules (manifest, structure, dépendances)
3. Charger dynamiquement les modèles des modules activés
4. Enregistrer les routes des modules activés
5. Initialiser les hooks, traductions, permissions des modules

Architecture modulaire professionnelle :
- Les modules ne sont JAMAIS importés statiquement
- Le CORE découvre et charge les modules au démarrage
- Chaque module est isolé et peut être activé/désactivé
- Les migrations sont générées automatiquement à partir des modèles chargés
"""

import importlib
import importlib.util
import inspect
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Type

from fastapi import APIRouter
from sqlmodel import SQLModel
from sqlalchemy.ext.declarative import DeclarativeMeta

from app.core.models.base import AbstractBaseModel


class ModuleValidationError(Exception):
    """Exception levée lors de la validation d'un module"""
    pass


class ModuleLoader:
    """
    Gestionnaire de chargement dynamique des modules.

    Ce service gère le cycle de vie complet des modules :
    - Discovery (découverte des modules disponibles)
    - Validation (intégrité, dépendances, conflits)
    - Loading (chargement dynamique des composants)
    - Registration (enregistrement dans le CORE)

    IMPORTANT: Les modules restent dans /modules/ (pas de copie dans backend)
    Le chargement se fait directement depuis /modules/{code}/backend/
    """

    # Chemin de base des modules
    MODULES_DIR = Path("/modules")

    # Registry des modules chargés (pour hot reload)
    _loaded_modules: Dict[str, Dict[str, Any]] = {}  # Metadata des modules
    _loaded_models: List[Type[SQLModel]] = []  # DEPRECATED - Models via migrations
    _loaded_routers: Dict[str, APIRouter] = {}  # Module code -> Router
    _module_sys_paths: Dict[str, str] = {}  # Module code -> sys.path ajouté

    # IMPORTANT: Pour le hot reload sans redémarrage
    # - Les MODELES sont gérés via des migrations Alembic (pas de chargement dynamique)
    # - Seuls les ROUTERS sont chargés dynamiquement (FastAPI le supporte)
    # - Un module peut être activé/désactivé sans restart en ajoutant/retirant son router

    @classmethod
    def discover_modules(cls) -> List[Dict[str, Any]]:
        """
        Découvre tous les modules disponibles dans /modules/

        Returns:
            Liste des manifests des modules découverts
        """
        modules = []

        if not cls.MODULES_DIR.exists():
            return modules

        for module_dir in cls.MODULES_DIR.iterdir():
            if not module_dir.is_dir():
                continue

            manifest_path = module_dir / "manifest.json"
            if not manifest_path.exists():
                continue

            try:
                with open(manifest_path, 'r', encoding='utf-8') as f:
                    manifest = json.load(f)
                    manifest['_path'] = str(module_dir)
                    modules.append(manifest)
            except Exception as e:
                print(f"Error reading manifest for {module_dir.name}: {e}")
                continue

        return modules

    @classmethod
    def validate_module(cls, manifest: Dict[str, Any]) -> bool:
        """
        Valide l'intégrité d'un module.

        Vérifie :
        - Structure du manifest
        - Présence des fichiers requis
        - Validité des dépendances
        - Absence de conflits

        Args:
            manifest: Manifest du module à valider

        Returns:
            True si le module est valide

        Raises:
            ModuleValidationError: Si le module est invalide
        """
        module_path = Path(manifest.get('_path', ''))
        module_code = manifest.get('code')

        # 1. Vérifier les champs obligatoires du manifest
        required_fields = ['name', 'code', 'version']
        for field in required_fields:
            if field not in manifest:
                raise ModuleValidationError(f"Missing required field '{field}' in manifest")

        # 2. Vérifier la structure des fichiers
        backend_dir = module_path / "backend"
        if backend_dir.exists():
            # Si backend existe, vérifier les fichiers requis
            init_file = backend_dir / "__init__.py"
            if not init_file.exists():
                raise ModuleValidationError(f"Missing __init__.py in {backend_dir}")

            # Vérifier models.py si présent
            models_file = backend_dir / "models.py"
            if models_file.exists():
                # Valider que models.py est importable
                try:
                    cls._validate_python_file(models_file)
                except Exception as e:
                    raise ModuleValidationError(f"Invalid models.py: {e}")

            # Vérifier routes.py si présent
            routes_file = backend_dir / "routes.py"
            if routes_file.exists():
                try:
                    cls._validate_python_file(routes_file)
                except Exception as e:
                    raise ModuleValidationError(f"Invalid routes.py: {e}")

        # 3. Vérifier les dépendances
        dependencies = manifest.get('dependencies', {})

        # Dépendances services CORE
        core_services = dependencies.get('core_services', [])
        # TODO: Vérifier que les services CORE requis sont disponibles

        # Dépendances autres modules
        required_modules = dependencies.get('modules', [])
        for req_module in required_modules:
            req_code = req_module.get('code')
            # TODO: Vérifier que le module requis est installé et activé

        # 4. Vérifier les conflits de noms (permissions, menus, hooks)
        # TODO: Vérifier qu'aucune permission/menu/hook ne conflicte avec l'existant

        return True

    @classmethod
    def _validate_python_file(cls, file_path: Path):
        """Valide qu'un fichier Python est syntaxiquement correct"""
        with open(file_path, 'r', encoding='utf-8') as f:
            code = f.read()
            compile(code, str(file_path), 'exec')

    @classmethod
    def validate_module_models(cls, module_code: str) -> Dict[str, Any]:
        """
        Valide les modèles d'un module SANS les charger dans SQLAlchemy.

        Pour le hot reload, les modèles sont gérés via des migrations Alembic.
        Cette méthode sert uniquement à :
        1. Valider la syntaxe des modèles
        2. Lister les tables qui seront créées
        3. Vérifier les dépendances

        Args:
            module_code: Code du module (ex: 'hse')

        Returns:
            Dict avec info sur les modèles (tables, relations, etc.)
        """
        info = {
            'valid': True,
            'tables': [],
            'errors': []
        }

        module_path = cls.MODULES_DIR / module_code
        backend_path = module_path / "backend"
        models_file = backend_path / "models.py"

        if not models_file.exists():
            return info

        try:
            # Lire et compiler le fichier pour valider la syntaxe
            with open(models_file, 'r', encoding='utf-8') as f:
                code = f.read()
                compile(code, str(models_file), 'exec')

            # Parser le fichier pour extraire les noms de tables
            # (sans l'exécuter pour éviter les problèmes SQLAlchemy)
            import ast
            tree = ast.parse(code)

            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef):
                    # Chercher __tablename__ dans la classe
                    for item in node.body:
                        if isinstance(item, ast.Assign):
                            for target in item.targets:
                                if isinstance(target, ast.Name) and target.id == '__tablename__':
                                    if isinstance(item.value, ast.Constant):
                                        info['tables'].append({
                                            'class': node.name,
                                            'table': item.value.value
                                        })

            print(f"  ✓ Module models validated: {len(info['tables'])} table(s) found")
            for table in info['tables']:
                print(f"    - {table['class']} -> {table['table']}")

        except Exception as e:
            info['valid'] = False
            info['errors'].append(str(e))
            print(f"  ✗ Error validating models from {module_code}: {e}")

        return info

    @classmethod
    def load_module_router(cls, module_code: str, app=None) -> Optional[APIRouter]:
        """
        Charge dynamiquement le router d'un module et l'ajoute à l'app FastAPI.

        IMPORTANT pour le hot reload:
        - Le router est chargé SANS importer models.py (évite SQLAlchemy metadata conflicts)
        - Les modèles doivent être importés depuis app.models (ajoutés via migration)
        - Le router peut être ajouté/retiré sans redémarrer l'application

        Args:
            module_code: Code du module (ex: 'hse')
            app: Instance FastAPI (optionnel, pour enregistrer directement)

        Returns:
            APIRouter du module ou None
        """
        # Vérifier si le module est déjà chargé
        if module_code in cls._loaded_routers:
            print(f"  ⚠ Router already loaded for module '{module_code}'")
            return cls._loaded_routers[module_code]

        module_path = cls.MODULES_DIR / module_code
        backend_path = module_path / "backend"
        routes_file = backend_path / "routes.py"

        if not routes_file.exists():
            print(f"  ⚠ No routes.py found for module '{module_code}'")
            return None

        # Ajouter le chemin du module au sys.path
        module_backend_path_str = str(backend_path)
        if module_backend_path_str not in sys.path:
            sys.path.insert(0, module_backend_path_str)
            cls._module_sys_paths[module_code] = module_backend_path_str

        try:
            # Charger le module routes avec un nom unique
            module_name = f"modules_{module_code}_routes"

            # Supprimer l'ancien module s'il existe (pour permettre le reload)
            if module_name in sys.modules:
                del sys.modules[module_name]

            spec = importlib.util.spec_from_file_location(module_name, routes_file)
            if spec and spec.loader:
                module = importlib.util.module_from_spec(spec)
                sys.modules[module_name] = module
                spec.loader.exec_module(module)

                # Récupérer le router
                if hasattr(module, 'router'):
                    router = getattr(module, 'router')
                    if isinstance(router, APIRouter):
                        # Stocker dans le registry
                        cls._loaded_routers[module_code] = router

                        # Enregistrer dans l'app si fournie
                        if app:
                            app.include_router(router)
                            print(f"  ✓ Router registered: {module_code} (prefix: {router.prefix})")
                        else:
                            print(f"  ✓ Router loaded: {module_code} (prefix: {router.prefix})")

                        return router

            print(f"  ⚠ No 'router' object found in {module_code}/routes.py")
            return None

        except Exception as e:
            print(f"  ✗ Error loading router from {module_code}: {e}")
            import traceback
            traceback.print_exc()
            return None

    @classmethod
    def unload_module_router(cls, module_code: str, app=None) -> bool:
        """
        Décharge le router d'un module (hot reload).

        Args:
            module_code: Code du module
            app: Instance FastAPI (pour retirer les routes)

        Returns:
            True si réussi
        """
        if module_code not in cls._loaded_routers:
            return False

        router = cls._loaded_routers[module_code]

        # Retirer les routes de FastAPI
        if app:
            # FastAPI ne supporte pas nativement le retrait de routes
            # On doit reconstruire la liste des routes
            app.routes = [route for route in app.routes if not any(
                route.path.startswith(router.prefix) for router in [router]
            )]

        # Nettoyer le registry
        del cls._loaded_routers[module_code]

        # Nettoyer sys.modules
        module_name = f"modules_{module_code}_routes"
        if module_name in sys.modules:
            del sys.modules[module_name]

        # Nettoyer sys.path
        if module_code in cls._module_sys_paths:
            path = cls._module_sys_paths[module_code]
            if path in sys.path:
                sys.path.remove(path)
            del cls._module_sys_paths[module_code]

        print(f"  ✓ Router unloaded: {module_code}")
        return True

    @classmethod
    def sync_module_widgets(cls, module_code: str, session) -> Dict[str, Any]:
        """
        Synchronise les widgets d'un module avec la base de données.

        Lit le fichier widgets.json du module et crée/met à jour les widgets
        dans la table widget de la base de données.

        Args:
            module_code: Code du module (ex: 'third-parties')
            session: Session SQLModel pour accéder à la DB

        Returns:
            Dict avec les statistiques de synchronisation
        """
        from app.models_dashboard import Widget
        from sqlmodel import select

        result = {
            'synced': False,
            'created': 0,
            'updated': 0,
            'total': 0,
            'errors': []
        }

        module_path = cls.MODULES_DIR / module_code
        widgets_file = module_path / "backend" / "widgets.json"

        if not widgets_file.exists():
            # Pas de widgets pour ce module, c'est ok
            return result

        try:
            with open(widgets_file, 'r', encoding='utf-8') as f:
                widgets_data = json.load(f)

            if not isinstance(widgets_data, list):
                result['errors'].append("widgets.json doit contenir un tableau")
                return result

            for widget_data in widgets_data:
                try:
                    widget_type = widget_data.get('widget_type')
                    if not widget_type:
                        result['errors'].append("widget_type manquant")
                        continue

                    # Vérifier si le widget existe déjà
                    existing = session.exec(
                        select(Widget).where(
                            Widget.widget_type == widget_type,
                            Widget.deleted_at.is_(None)
                        )
                    ).first()

                    if existing:
                        # Mettre à jour
                        existing.name = widget_data.get('name', existing.name)
                        existing.description = widget_data.get('description')
                        existing.module_name = module_code
                        existing.category = widget_data.get('category')
                        existing.icon = widget_data.get('icon')
                        existing.required_permission = widget_data.get('required_permission')
                        existing.is_active = widget_data.get('is_active', True)
                        existing.default_config = widget_data.get('default_config', {})
                        existing.default_size = widget_data.get('default_size', {
                            "w": 3, "h": 2, "minW": 2, "minH": 1, "maxW": 12, "maxH": 6
                        })
                        session.add(existing)
                        result['updated'] += 1
                    else:
                        # Créer
                        new_widget = Widget(
                            widget_type=widget_type,
                            name=widget_data.get('name', widget_type),
                            description=widget_data.get('description'),
                            module_name=module_code,
                            category=widget_data.get('category'),
                            icon=widget_data.get('icon'),
                            required_permission=widget_data.get('required_permission'),
                            is_active=widget_data.get('is_active', True),
                            default_config=widget_data.get('default_config', {}),
                            default_size=widget_data.get('default_size', {
                                "w": 3, "h": 2, "minW": 2, "minH": 1, "maxW": 12, "maxH": 6
                            })
                        )
                        session.add(new_widget)
                        result['created'] += 1

                except Exception as e:
                    result['errors'].append(f"Erreur widget {widget_type}: {str(e)}")

            session.commit()
            result['synced'] = True
            result['total'] = result['created'] + result['updated']

            if result['total'] > 0:
                print(f"    ✓ Widgets synchronisés: {result['created']} créé(s), {result['updated']} mis à jour")

        except Exception as e:
            result['errors'].append(f"Erreur lecture widgets.json: {str(e)}")
            session.rollback()

        return result

    @classmethod
    def load_active_modules(cls, session, app=None) -> Dict[str, Any]:
        """
        Charge tous les modules activés (HOT RELOAD compatible).

        Architecture pour le hot reload:
        1. Valide les modèles SANS les charger (les tables sont créées via migrations)
        2. Charge les routers dynamiquement dans FastAPI
        3. Synchronise les widgets avec la base de données
        4. Peut être appelé plusieurs fois sans redémarrer

        Args:
            session: Session SQLModel pour accéder à la DB
            app: Instance FastAPI pour enregistrer les routers

        Returns:
            Dictionnaire des modules chargés
        """
        from app.services.module_service import ModuleManager

        loaded = {
            'routers': [],
            'modules': [],
            'widgets': [],
            'errors': []
        }

        print("\n" + "="*60)
        print("🔌 MODULE LOADER - Hot reload des modules activés")
        print("="*60)

        # Récupérer les modules activés depuis la DB
        active_modules = ModuleManager.get_active_modules(session)

        if not active_modules:
            print("ℹ️  Aucun module activé")
            return loaded

        print(f"\n📦 {len(active_modules)} module(s) activé(s) trouvé(s)\n")

        for module in active_modules:
            module_code = module.code
            print(f"  → Chargement du module '{module_code}' v{module.version}")

            try:
                # 1. Valider les modèles (sans les charger dans SQLAlchemy)
                models_info = cls.validate_module_models(module_code)
                if not models_info['valid']:
                    print(f"  ⚠ Module models validation failed")
                    for error in models_info['errors']:
                        print(f"    - {error}")
                    loaded['errors'].append({
                        'module': module_code,
                        'error': 'Model validation failed',
                        'details': models_info['errors']
                    })
                    continue

                # 2. Charger le router (HOT RELOAD compatible)
                router = cls.load_module_router(module_code, app=app)
                if router:
                    loaded['routers'].append({
                        'code': module_code,
                        'prefix': router.prefix,
                        'tags': router.tags
                    })

                # 3. Synchroniser les widgets du module
                widgets_result = cls.sync_module_widgets(module_code, session)
                if widgets_result['synced']:
                    loaded['widgets'].append({
                        'code': module_code,
                        'created': widgets_result['created'],
                        'updated': widgets_result['updated'],
                        'total': widgets_result['total']
                    })

                loaded['modules'].append({
                    'code': module_code,
                    'name': module.name,
                    'version': module.version,
                    'tables': models_info['tables']
                })

                print(f"  ✅ Module '{module_code}' chargé avec succès\n")

            except Exception as e:
                print(f"  ❌ Erreur lors du chargement de '{module_code}': {e}\n")
                loaded['errors'].append({
                    'module': module_code,
                    'error': str(e)
                })
                # Ne pas arrêter le chargement des autres modules
                continue

        print("="*60)
        print(f"✅ Chargement terminé: {len(loaded['modules'])} modules chargés")
        print(f"   - {len(loaded['routers'])} routers")

        # Compter le total de widgets synchronisés
        total_widgets = sum(w['total'] for w in loaded['widgets'])
        if total_widgets > 0:
            print(f"   - {total_widgets} widgets synchronisés")

        if loaded['errors']:
            print(f"   - {len(loaded['errors'])} erreurs")
        print("="*60 + "\n")

        return loaded

    @classmethod
    def get_loaded_models(cls) -> List[Type[SQLModel]]:
        """Retourne la liste des modèles chargés"""
        return cls._loaded_models

    @classmethod
    def get_loaded_routers(cls) -> List[APIRouter]:
        """Retourne la liste des routers chargés"""
        return cls._loaded_routers

    @classmethod
    def register_module_routers(cls, app):
        """
        Enregistre tous les routers des modules chargés dans l'app FastAPI.

        Args:
            app: Instance FastAPI
        """
        for router in cls._loaded_routers:
            app.include_router(router)
            print(f"  ✓ Router registered: {router.prefix}")
