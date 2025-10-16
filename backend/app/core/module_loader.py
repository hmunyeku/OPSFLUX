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
    """

    # Chemins de base
    MODULES_DIR = Path("/modules")
    BACKEND_MODULES_DIR = Path("/backend/app/modules")

    # Modules chargés (cache)
    _loaded_modules: Dict[str, Dict[str, Any]] = {}
    _loaded_models: List[Type[SQLModel]] = []
    _loaded_routers: List[APIRouter] = []

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
    def load_module_models(cls, module_code: str) -> List[Type[SQLModel]]:
        """
        Charge dynamiquement les modèles d'un module.

        Args:
            module_code: Code du module (ex: 'hse')

        Returns:
            Liste des classes de modèles chargées
        """
        models = []

        # Construire le chemin du module
        backend_module_path = cls.BACKEND_MODULES_DIR / module_code
        models_file = backend_module_path / "models.py"

        if not models_file.exists():
            return models

        # Importer dynamiquement le module
        module_name = f"app.modules.{module_code}.models"

        try:
            # Importer le module
            if module_name in sys.modules:
                # Recharger si déjà importé
                module = importlib.reload(sys.modules[module_name])
            else:
                module = importlib.import_module(module_name)

            # Extraire toutes les classes qui héritent de SQLModel et ont table=True
            for name, obj in inspect.getmembers(module, inspect.isclass):
                # Vérifier que c'est une table SQLModel (pas un schema Pydantic)
                if (hasattr(obj, '__tablename__') and
                    issubclass(obj, SQLModel) and
                    obj is not SQLModel and
                    obj is not AbstractBaseModel):
                    models.append(obj)
                    print(f"  ✓ Loaded model: {name} (table: {obj.__tablename__})")

        except Exception as e:
            print(f"  ✗ Error loading models from {module_code}: {e}")
            raise

        return models

    @classmethod
    def load_module_router(cls, module_code: str) -> Optional[APIRouter]:
        """
        Charge dynamiquement le router d'un module.

        Args:
            module_code: Code du module (ex: 'hse')

        Returns:
            APIRouter du module ou None
        """
        # Construire le chemin du module
        backend_module_path = cls.BACKEND_MODULES_DIR / module_code
        routes_file = backend_module_path / "routes.py"

        if not routes_file.exists():
            return None

        # Importer dynamiquement le module
        module_name = f"app.modules.{module_code}.routes"

        try:
            # Importer le module
            if module_name in sys.modules:
                module = importlib.reload(sys.modules[module_name])
            else:
                module = importlib.import_module(module_name)

            # Chercher l'objet 'router'
            if hasattr(module, 'router'):
                router = getattr(module, 'router')
                if isinstance(router, APIRouter):
                    print(f"  ✓ Loaded router: {module_code} (prefix: {router.prefix})")
                    return router

            print(f"  ⚠ No router found in {module_code}.routes")
            return None

        except Exception as e:
            print(f"  ✗ Error loading router from {module_code}: {e}")
            raise

    @classmethod
    def load_active_modules(cls, session) -> Dict[str, Any]:
        """
        Charge tous les modules activés dans la base de données.

        Cette méthode est appelée au démarrage de l'application.

        Args:
            session: Session SQLModel pour accéder à la DB

        Returns:
            Dictionnaire des modules chargés avec leurs composants
        """
        from app.services.module_service import ModuleManager

        loaded = {
            'models': [],
            'routers': [],
            'modules': []
        }

        print("\n" + "="*60)
        print("🔌 MODULE LOADER - Chargement des modules activés")
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
                # Charger les modèles
                models = cls.load_module_models(module_code)
                loaded['models'].extend(models)
                cls._loaded_models.extend(models)

                # Charger le router
                router = cls.load_module_router(module_code)
                if router:
                    loaded['routers'].append(router)
                    cls._loaded_routers.append(router)

                loaded['modules'].append({
                    'code': module_code,
                    'name': module.name,
                    'version': module.version
                })

                print(f"  ✅ Module '{module_code}' chargé avec succès\n")

            except Exception as e:
                print(f"  ❌ Erreur lors du chargement de '{module_code}': {e}\n")
                # Ne pas arrêter le chargement des autres modules
                continue

        print("="*60)
        print(f"✅ Chargement terminé: {len(loaded['modules'])} modules chargés")
        print(f"   - {len(loaded['models'])} modèles")
        print(f"   - {len(loaded['routers'])} routers")
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
