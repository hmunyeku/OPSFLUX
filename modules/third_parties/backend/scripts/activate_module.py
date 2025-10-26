"""
Script d'activation du module Third Parties.

Ce script enregistre le module dans la base de données et l'active.
Le ModuleLoader se chargera automatiquement de :
- Charger les routes
- Synchroniser les widgets
- Créer les permissions (depuis manifest.json)
- Créer les menus (depuis manifest.json)
- Enregistrer les hooks (depuis manifest.json)

Usage:
    python modules/third-parties/backend/scripts/activate_module.py
"""

import sys
from pathlib import Path
import json

# Ajouter le répertoire racine au path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "backend"))

# Import all models first to ensure tables are registered
from app.core.db import engine, init_db
from sqlmodel import Session, select
from app.core.config import settings
from app.models_modules import Module, ModuleStatus


def activate_module():
    """Active le module Third Parties"""

    # Lire le manifest
    manifest_path = Path(__file__).parent.parent.parent / "manifest.json"
    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    with Session(engine) as session:
        print("=" * 70)
        print("🔌 ACTIVATION DU MODULE THIRD PARTIES")
        print("=" * 70)

        # Vérifier si le module existe déjà
        existing = session.exec(
            select(Module).where(
                Module.code == manifest['code'],
                Module.deleted_at.is_(None)
            )
        ).first()

        if existing:
            print(f"\n  ℹ️  Le module '{manifest['code']}' existe déjà")
            print(f"     Statut actuel: {existing.status}")

            if existing.status == ModuleStatus.ACTIVE:
                print(f"     ✅ Le module est déjà activé !")
                return

            # Activer le module existant
            existing.status = ModuleStatus.ACTIVE
            existing.version = manifest['version']
            existing.name = manifest['name']
            existing.description = manifest['description']
            existing.is_system = manifest.get('is_system', False)
            existing.is_required = manifest.get('is_required', False)
            existing.config = manifest
            session.add(existing)
            session.commit()

            print(f"     ✅ Module activé avec succès !")

        else:
            print(f"\n  📦 Création et activation du module '{manifest['code']}'...")

            # Créer le module
            module = Module(
                code=manifest['code'],
                name=manifest['name'],
                version=manifest['version'],
                description=manifest['description'],
                status=ModuleStatus.ACTIVE,
                is_system=manifest.get('is_system', False),
                is_required=manifest.get('is_required', False),
                config=manifest
            )
            session.add(module)
            session.commit()

            print(f"     ✅ Module créé et activé avec succès !")

        print("\n" + "=" * 70)
        print("✅ ACTIVATION TERMINÉE")
        print("=" * 70)
        print("\n💡 Le module sera chargé au prochain redémarrage du backend.")
        print("   Les routes, widgets, permissions et menus seront")
        print("   automatiquement synchronisés par le ModuleLoader.")
        print("\n📋 Pour appliquer immédiatement (sans redémarrage):")
        print("   1. Restart du backend: docker compose restart backend")
        print("   2. Le ModuleLoader chargera automatiquement le module")
        print("\n" + "=" * 70)


if __name__ == "__main__":
    try:
        activate_module()
    except Exception as e:
        print(f"\n❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
