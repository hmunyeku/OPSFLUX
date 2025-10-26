"""
Script complet d'enregistrement du module Third Parties.

Ce script effectue toutes les opérations nécessaires pour enregistrer
le module Third Parties dans la base de données :
- Création des permissions
- Création des tables du module
- Enregistrement des widgets
- Création des entrées de menu

Usage:
    python backend/scripts/register_third_parties_module.py
"""

import sys
from pathlib import Path

# Ajouter le répertoire racine au path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlmodel import Session, select, create_engine
from app.core.config import settings
from app.models import Permission, Menu, MenuItem
from app.models_dashboard import Widget
import json


# ============================================================================
# PERMISSIONS
# ============================================================================

THIRD_PARTIES_PERMISSIONS = [
    # Permissions Companies
    {
        "code": "companies.read",
        "name": "Voir les entreprises",
        "description": "Permet de consulter la liste et les détails des entreprises tierces",
        "module": "third-parties",
        "category": "companies",
    },
    {
        "code": "companies.create",
        "name": "Créer des entreprises",
        "description": "Permet de créer de nouvelles entreprises tierces",
        "module": "third-parties",
        "category": "companies",
    },
    {
        "code": "companies.update",
        "name": "Modifier des entreprises",
        "description": "Permet de modifier les informations des entreprises tierces",
        "module": "third-parties",
        "category": "companies",
    },
    {
        "code": "companies.delete",
        "name": "Supprimer des entreprises",
        "description": "Permet de supprimer des entreprises tierces",
        "module": "third-parties",
        "category": "companies",
    },
    # Permissions Contacts
    {
        "code": "contacts.read",
        "name": "Voir les contacts",
        "description": "Permet de consulter la liste et les détails des contacts",
        "module": "third-parties",
        "category": "contacts",
    },
    {
        "code": "contacts.create",
        "name": "Créer des contacts",
        "description": "Permet de créer de nouveaux contacts",
        "module": "third-parties",
        "category": "contacts",
    },
    {
        "code": "contacts.update",
        "name": "Modifier des contacts",
        "description": "Permet de modifier les informations des contacts",
        "module": "third-parties",
        "category": "contacts",
    },
    {
        "code": "contacts.delete",
        "name": "Supprimer des contacts",
        "description": "Permet de supprimer des contacts",
        "module": "third-parties",
        "category": "contacts",
    },
    # Permissions Invitations
    {
        "code": "contacts.invite",
        "name": "Inviter des contacts",
        "description": "Permet d'envoyer des invitations aux contacts pour créer un compte",
        "module": "third-parties",
        "category": "invitations",
    },
    {
        "code": "contacts.manage_invitations",
        "name": "Gérer les invitations",
        "description": "Permet de gérer (voir, révoquer) les invitations envoyées",
        "module": "third-parties",
        "category": "invitations",
    },
    {
        "code": "contacts.grant_admin",
        "name": "Donner les droits admin",
        "description": "Permet d'inviter des contacts avec des droits d'administrateur",
        "module": "third-parties",
        "category": "invitations",
    },
    # Permission générale du module
    {
        "code": "third_parties.admin",
        "name": "Administration Third Parties",
        "description": "Accès administrateur complet au module Third Parties",
        "module": "third-parties",
        "category": "admin",
    },
]


# ============================================================================
# MENU
# ============================================================================

MENU_ITEMS = [
    {
        "key": "third-parties",
        "label": "Tiers",
        "icon": "building",
        "path": None,
        "order": 40,
        "parent_key": None,
        "is_active": True,
        "required_permission": "companies.read",
        "children": [
            {
                "key": "third-parties-companies",
                "label": "Entreprises",
                "icon": "building",
                "path": "/third-parties/companies",
                "order": 10,
                "is_active": True,
                "required_permission": "companies.read",
            },
            {
                "key": "third-parties-contacts",
                "label": "Contacts",
                "icon": "users",
                "path": "/third-parties/contacts",
                "order": 20,
                "is_active": True,
                "required_permission": "contacts.read",
            },
            {
                "key": "third-parties-invitations",
                "label": "Invitations",
                "icon": "mail",
                "path": "/third-parties/invitations",
                "order": 30,
                "is_active": True,
                "required_permission": "contacts.invite",
            },
        ],
    },
]


# ============================================================================
# FONCTIONS
# ============================================================================

def register_permissions(session: Session):
    """Enregistre les permissions"""
    print("\n🔒 Enregistrement des permissions...")
    created = 0
    updated = 0

    for perm_data in THIRD_PARTIES_PERMISSIONS:
        existing = session.exec(
            select(Permission).where(Permission.code == perm_data["code"])
        ).first()

        if existing:
            print(f"  ⚠️  Permission '{perm_data['code']}' existe déjà, mise à jour...")
            for key, value in perm_data.items():
                setattr(existing, key, value)
            updated += 1
        else:
            print(f"  ✅ Création de la permission '{perm_data['code']}'...")
            permission = Permission(**perm_data)
            session.add(permission)
            created += 1

    print(f"  → {created} créée(s), {updated} mise(s) à jour")
    return created, updated


def register_widgets(session: Session):
    """Enregistre les widgets"""
    print("\n📊 Enregistrement des widgets...")

    widgets_file = Path("modules/third-parties/backend/widgets.json")
    if not widgets_file.exists():
        print("  ⚠️  Fichier widgets.json non trouvé, ignoré")
        return 0, 0

    with open(widgets_file, 'r', encoding='utf-8') as f:
        widgets_data = json.load(f)

    created = 0
    updated = 0

    for widget_data in widgets_data:
        existing = session.exec(
            select(Widget).where(Widget.widget_type == widget_data["widget_type"])
        ).first()

        if existing:
            print(f"  ⚠️  Widget '{widget_data['name']}' existe déjà, mise à jour...")
            for key, value in widget_data.items():
                setattr(existing, key, value)
            updated += 1
        else:
            print(f"  ✅ Création du widget '{widget_data['name']}'...")
            widget = Widget(**widget_data)
            session.add(widget)
            created += 1

    print(f"  → {created} créé(s), {updated} mis à jour")
    return created, updated


def register_menu_items(session: Session):
    """Enregistre les entrées de menu"""
    print("\n📋 Enregistrement des entrées de menu...")

    created = 0
    updated = 0

    def create_menu_item(item_data, parent_id=None):
        nonlocal created, updated

        children = item_data.pop("children", [])

        # Vérifier si l'item existe déjà
        existing = session.exec(
            select(MenuItem).where(MenuItem.key == item_data["key"])
        ).first()

        if existing:
            print(f"  ⚠️  Menu '{item_data['label']}' existe déjà, mise à jour...")
            for key, value in item_data.items():
                setattr(existing, key, value)
            if parent_id:
                existing.parent_id = parent_id
            menu_item = existing
            updated += 1
        else:
            print(f"  ✅ Création du menu '{item_data['label']}'...")
            menu_item = MenuItem(**item_data, parent_id=parent_id)
            session.add(menu_item)
            created += 1

        # Flush pour obtenir l'ID
        session.flush()

        # Créer les enfants
        for child_data in children:
            create_menu_item(child_data, menu_item.id)

    for menu_data in MENU_ITEMS:
        create_menu_item(menu_data)

    print(f"  → {created} créé(s), {updated} mis à jour")
    return created, updated


def create_tables():
    """Crée les tables du module via Alembic"""
    print("\n🗄️  Création des tables du module...")

    try:
        import subprocess
        result = subprocess.run(
            ["python", "backend/scripts/create_company_tables.py"],
            capture_output=True,
            text=True
        )

        if result.returncode == 0:
            print("  ✅ Tables créées avec succès")
            return True
        else:
            print(f"  ⚠️  Erreur lors de la création des tables: {result.stderr}")
            return False
    except FileNotFoundError:
        print("  ℹ️  Script create_company_tables.py non trouvé, tables peut-être déjà créées")
        return True


# ============================================================================
# MAIN
# ============================================================================

def main():
    print("=" * 70)
    print("🚀 ENREGISTREMENT DU MODULE THIRD PARTIES")
    print("=" * 70)

    engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))

    # Étape 1: Créer les tables
    create_tables()

    # Étape 2-4: Enregistrer dans la DB
    with Session(engine) as session:
        # Permissions
        perm_created, perm_updated = register_permissions(session)

        # Widgets
        widget_created, widget_updated = register_widgets(session)

        # Menu
        menu_created, menu_updated = register_menu_items(session)

        # Commit
        session.commit()

    # Résumé
    print("\n" + "=" * 70)
    print("✅ ENREGISTREMENT TERMINÉ")
    print("=" * 70)
    print(f"📊 Permissions  : {perm_created} créées, {perm_updated} mises à jour")
    print(f"📈 Widgets      : {widget_created} créés, {widget_updated} mis à jour")
    print(f"📋 Menu         : {menu_created} créés, {menu_updated} mis à jour")
    print("\n💡 Le module Third Parties est maintenant enregistré et prêt à l'emploi!")
    print("=" * 70)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
