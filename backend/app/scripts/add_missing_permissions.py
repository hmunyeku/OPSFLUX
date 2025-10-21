"""
Script pour ajouter les permissions manquantes dans la base de données.

Modules/endpoints qui ont des routes mais pas de permissions :
- address_types
- backups
- languages
- notifications
- user_preferences
- security/2fa
"""
from sqlmodel import Session, select
from app.core.db import engine
from app.models_rbac import Permission


# Permissions à ajouter
MISSING_PERMISSIONS = [
    # Address Types
    {"module": "addresses", "code": "address_types.read", "name": "Voir les types d'adresses"},
    {"module": "addresses", "code": "address_types.create", "name": "Créer des types d'adresses"},
    {"module": "addresses", "code": "address_types.update", "name": "Modifier des types d'adresses"},
    {"module": "addresses", "code": "address_types.delete", "name": "Supprimer des types d'adresses"},

    # Backups
    {"module": "core", "code": "core.backups.read", "name": "Voir les sauvegardes"},
    {"module": "core", "code": "core.backups.create", "name": "Créer une sauvegarde"},
    {"module": "core", "code": "core.backups.restore", "name": "Restaurer une sauvegarde"},
    {"module": "core", "code": "core.backups.delete", "name": "Supprimer une sauvegarde"},
    {"module": "core", "code": "core.backups.download", "name": "Télécharger une sauvegarde"},
    {"module": "core", "code": "core.backups.schedule", "name": "Planifier des sauvegardes"},

    # Languages & Translations
    {"module": "core", "code": "core.languages.read", "name": "Voir les langues"},
    {"module": "core", "code": "core.languages.create", "name": "Ajouter une langue"},
    {"module": "core", "code": "core.languages.update", "name": "Modifier une langue"},
    {"module": "core", "code": "core.languages.delete", "name": "Supprimer une langue"},
    {"module": "core", "code": "core.languages.activate", "name": "Activer/Désactiver une langue"},
    {"module": "core", "code": "core.translations.read", "name": "Voir les traductions"},
    {"module": "core", "code": "core.translations.update", "name": "Modifier les traductions"},
    {"module": "core", "code": "core.translations.import", "name": "Importer des traductions"},
    {"module": "core", "code": "core.translations.export", "name": "Exporter des traductions"},

    # Notifications
    {"module": "core", "code": "core.notifications.read", "name": "Voir les notifications"},
    {"module": "core", "code": "core.notifications.create", "name": "Créer une notification"},
    {"module": "core", "code": "core.notifications.update", "name": "Modifier une notification"},
    {"module": "core", "code": "core.notifications.delete", "name": "Supprimer une notification"},
    {"module": "core", "code": "core.notifications.mark_read", "name": "Marquer comme lu"},
    {"module": "core", "code": "core.notifications.send", "name": "Envoyer des notifications"},

    # User Preferences
    {"module": "core", "code": "core.user_preferences.read", "name": "Voir les préférences utilisateur"},
    {"module": "core", "code": "core.user_preferences.update", "name": "Modifier les préférences utilisateur"},
    {"module": "core", "code": "core.user_preferences.reset", "name": "Réinitialiser les préférences"},

    # Security & 2FA
    {"module": "core", "code": "core.security.read", "name": "Voir la configuration de sécurité"},
    {"module": "core", "code": "core.security.configure", "name": "Configurer la sécurité"},
    {"module": "core", "code": "core.2fa.enable", "name": "Activer l'authentification à 2 facteurs"},
    {"module": "core", "code": "core.2fa.disable", "name": "Désactiver l'authentification à 2 facteurs"},
    {"module": "core", "code": "core.2fa.verify", "name": "Vérifier le code 2FA"},
    {"module": "core", "code": "core.2fa.reset", "name": "Réinitialiser le 2FA"},

    # Settings (ajout de permissions plus granulaires)
    {"module": "settings", "code": "settings.email.read", "name": "Voir les paramètres email"},
    {"module": "settings", "code": "settings.email.update", "name": "Modifier les paramètres email"},
    {"module": "settings", "code": "settings.email.test", "name": "Tester la connexion email"},
    {"module": "settings", "code": "settings.smtp.configure", "name": "Configurer SMTP"},
    {"module": "settings", "code": "settings.general.read", "name": "Voir les paramètres généraux"},
    {"module": "settings", "code": "settings.general.update", "name": "Modifier les paramètres généraux"},
    {"module": "settings", "code": "settings.appearance.read", "name": "Voir les paramètres d'apparence"},
    {"module": "settings", "code": "settings.appearance.update", "name": "Modifier les paramètres d'apparence"},
    {"module": "settings", "code": "settings.security.read", "name": "Voir les paramètres de sécurité"},
    {"module": "settings", "code": "settings.security.update", "name": "Modifier les paramètres de sécurité"},

    # Modules (ajout de permissions plus granulaires)
    {"module": "modules", "code": "modules.read", "name": "Voir les modules"},
    {"module": "modules", "code": "modules.marketplace.browse", "name": "Parcourir le marketplace"},
    {"module": "modules", "code": "modules.dependencies.view", "name": "Voir les dépendances des modules"},
    {"module": "modules", "code": "modules.logs.read", "name": "Voir les logs des modules"},

    # RBAC (ajout de permissions plus granulaires)
    {"module": "rbac", "code": "permissions.read", "name": "Voir les permissions"},
    {"module": "rbac", "code": "permissions.assign", "name": "Assigner des permissions"},
    {"module": "rbac", "code": "permissions.revoke", "name": "Révoquer des permissions"},
]


def main():
    """Ajoute les permissions manquantes dans la base de données."""
    with Session(engine) as session:
        added_count = 0
        skipped_count = 0

        for perm_data in MISSING_PERMISSIONS:
            # Vérifier si la permission existe déjà
            existing = session.exec(
                select(Permission).where(Permission.code == perm_data["code"])
            ).first()

            if existing:
                print(f"⏭️  Permission déjà existante : {perm_data['code']}")
                skipped_count += 1
                continue

            # Créer la nouvelle permission
            permission = Permission(
                module=perm_data["module"],
                code=perm_data["code"],
                name=perm_data["name"],
            )
            session.add(permission)
            print(f"✅ Permission ajoutée : {perm_data['code']} - {perm_data['name']}")
            added_count += 1

        # Sauvegarder toutes les permissions
        session.commit()

        print(f"\n{'='*60}")
        print(f"✅ {added_count} permissions ajoutées")
        print(f"⏭️  {skipped_count} permissions déjà existantes")
        print(f"{'='*60}")


if __name__ == "__main__":
    main()
