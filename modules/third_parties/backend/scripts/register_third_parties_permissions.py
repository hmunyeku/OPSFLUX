"""
Script pour enregistrer les permissions du module Third Parties.

Ce script crée toutes les permissions nécessaires pour le module Third Parties
dans la base de données.

Usage:
    python backend/scripts/register_third_parties_permissions.py
"""

import sys
from pathlib import Path
from sqlmodel import Session, select, create_engine

# Ajouter le répertoire racine au path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.config import settings
from app.models import Permission


# Définition des permissions du module Third Parties
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


def register_permissions():
    """Enregistre toutes les permissions du module Third Parties"""

    engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))

    with Session(engine) as session:
        print("🔒 Enregistrement des permissions du module Third Parties...")
        created_count = 0
        updated_count = 0

        for perm_data in THIRD_PARTIES_PERMISSIONS:
            # Vérifier si la permission existe déjà
            existing = session.exec(
                select(Permission).where(Permission.code == perm_data["code"])
            ).first()

            if existing:
                print(f"  ⚠️  Permission '{perm_data['code']}' existe déjà, mise à jour...")
                # Mettre à jour
                for key, value in perm_data.items():
                    setattr(existing, key, value)
                updated_count += 1
            else:
                print(f"  ✅ Création de la permission '{perm_data['code']}'...")
                permission = Permission(**perm_data)
                session.add(permission)
                created_count += 1

        session.commit()
        print(f"\n✅ Terminé!")
        print(f"   - {created_count} permission(s) créée(s)")
        print(f"   - {updated_count} permission(s) mise(s) à jour")
        print(f"   - Total: {created_count + updated_count} permission(s)")
        print(f"\n💡 Les permissions sont maintenant disponibles pour être assignées aux rôles.")


def main():
    try:
        register_permissions()
    except Exception as e:
        print(f"\n❌ Erreur lors de l'enregistrement des permissions: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
