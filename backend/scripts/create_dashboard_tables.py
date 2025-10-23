"""
Script pour créer les tables dashboard et widget dans la base de données.
Contourne le problème de cycle Alembic en créant les tables directement.

Usage:
    python scripts/create_dashboard_tables.py
"""

import sys
from pathlib import Path

# Ajouter le répertoire parent au sys.path pour pouvoir importer app
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlmodel import SQLModel, create_engine
from app.core.config import settings
from app.models_dashboard import Dashboard, Widget, DashboardWidget, UserDashboard


def create_tables():
    """Crée toutes les tables liées aux dashboards et widgets"""

    print(f"Connexion à la base de données: {settings.POSTGRES_SERVER}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}")

    # Créer l'engine
    engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))

    # Créer toutes les tables pour les modèles dashboard
    print("Création des tables dashboard...")
    try:
        # Créer les tables
        SQLModel.metadata.create_all(
            engine,
            tables=[
                Widget.__table__,
                Dashboard.__table__,
                DashboardWidget.__table__,
                UserDashboard.__table__,
            ]
        )
        print("✅ Tables créées avec succès:")
        print("   - widget")
        print("   - dashboard")
        print("   - dashboard_widget")
        print("   - user_dashboard")

    except Exception as e:
        print(f"❌ Erreur lors de la création des tables: {e}")
        import traceback
        traceback.print_exc()
        return False

    return True


if __name__ == "__main__":
    success = create_tables()
    sys.exit(0 if success else 1)
