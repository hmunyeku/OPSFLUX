"""
Script pour ajouter les colonnes menu_key et is_default_in_menu à la table dashboard.
Ces champs permettent d'afficher les dashboards dans les menus avec système de tabs.
"""

from sqlmodel import Session, create_engine, text
from app.core.config import settings

def add_menu_fields():
    """Ajouter les champs menu_key et is_default_in_menu à la table dashboard"""
    engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))

    with Session(engine) as session:
        print("Ajout des colonnes menu_key et is_default_in_menu à la table dashboard...")

        try:
            # Ajouter la colonne menu_key
            session.exec(text("""
                ALTER TABLE dashboard
                ADD COLUMN IF NOT EXISTS menu_key VARCHAR(100)
            """))

            # Ajouter la colonne is_default_in_menu
            session.exec(text("""
                ALTER TABLE dashboard
                ADD COLUMN IF NOT EXISTS is_default_in_menu BOOLEAN DEFAULT false NOT NULL
            """))

            # Créer l'index sur menu_key
            session.exec(text("""
                CREATE INDEX IF NOT EXISTS ix_dashboard_menu_key
                ON dashboard(menu_key)
            """))

            session.commit()

            print("✅ Colonnes ajoutées avec succès!")
            print("   - menu_key (VARCHAR(100), nullable)")
            print("   - is_default_in_menu (BOOLEAN, default: false)")
            print("   - Index créé sur menu_key")

        except Exception as e:
            print(f"❌ Erreur lors de l'ajout des colonnes: {e}")
            session.rollback()
            raise

if __name__ == "__main__":
    add_menu_fields()
