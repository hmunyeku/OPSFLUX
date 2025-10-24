"""
Script d'enregistrement du module [MODULE_NAME]

Ce script enregistre le module dans la base de données pour qu'il soit
automatiquement chargé par le ModuleLoader frontend.

Usage:
    docker exec -it opsflux-backend python modules/[MODULE_CODE]/backend/register.py
"""

import asyncio
import sys
from pathlib import Path

# Ajouter le répertoire racine au path pour pouvoir importer app
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_async_session
from app.models.module import Module


async def register_module():
    """Enregistre le module dans la base de données"""
    print("🔧 Enregistrement du module [MODULE_NAME]...")

    async for session in get_async_session():
        try:
            # Créer le module
            module = Module(
                code="[MODULE_CODE]",
                name="[MODULE_NAME]",
                description="Description de votre module",
                version="1.0.0",
                status="active",  # active, inactive, archived
                config={
                    # Configuration supplémentaire si nécessaire
                    "author": "Votre Nom",
                    "dependencies": [],
                },
            )

            session.add(module)
            await session.commit()
            await session.refresh(module)

            print(f"✅ Module '{module.code}' enregistré avec succès (ID: {module.id})")
            print(f"   Status: {module.status}")
            print(f"   Version: {module.version}")

        except Exception as e:
            await session.rollback()
            print(f"❌ Erreur lors de l'enregistrement du module: {e}")
            raise

        finally:
            await session.close()
            break


if __name__ == "__main__":
    asyncio.run(register_module())
