"""
Script pour insérer TOUTES les traductions de l'application (version SQL directe)
"""

import asyncio
import uuid
from sqlalchemy import text
from app.core.db import engine


# Définition simplifiée: {namespace_code: {key: {fr, en}}}
TRANSLATIONS = {
    "core.auth": {
        # Login page
        "login.title": {"fr": "Se connecter", "en": "Sign in"},
        "login.subtitle": {"fr": "Entrez votre email et mot de passe pour accéder à votre compte", "en": "Enter your email and password to access your account"},
        "login.email": {"fr": "Email", "en": "Email"},
        "login.email_placeholder": {"fr": "name@example.com", "en": "name@example.com"},
        "login.password": {"fr": "Mot de passe", "en": "Password"},
        "login.password_placeholder": {"fr": "********", "en": "********"},
        "login.forgot_password": {"fr": "Mot de passe oublié ?", "en": "Forgot password?"},
        "login.button": {"fr": "Se connecter", "en": "Sign in"},
        "login.button_loading": {"fr": "Connexion...", "en": "Signing in..."},
        "login.terms_text": {"fr": "En vous connectant, vous acceptez nos", "en": "By signing in, you agree to our"},
        "login.terms_link": {"fr": "Conditions d'utilisation", "en": "Terms of Service"},
        "login.terms_and": {"fr": "et notre", "en": "and our"},
        "login.privacy_link": {"fr": "Politique de confidentialité", "en": "Privacy Policy"},

        # Validation messages
        "validation.email_required": {"fr": "Veuillez entrer votre email", "en": "Please enter your email"},
        "validation.email_invalid": {"fr": "Adresse email invalide", "en": "Invalid email address"},
        "validation.password_required": {"fr": "Veuillez entrer votre mot de passe", "en": "Please enter your password"},
        "validation.password_min_length": {"fr": "Le mot de passe doit contenir au moins 7 caractères", "en": "Password must be at least 7 characters"},

        # Success/Error messages
        "message.login_success": {"fr": "Vous êtes connecté avec succès", "en": "You are successfully logged in"},
        "message.login_error": {"fr": "Identifiants invalides", "en": "Invalid credentials"},
        "message.2fa_error": {"fr": "Code 2FA invalide", "en": "Invalid 2FA code"},
        "message.success": {"fr": "Succès", "en": "Success"},
        "message.error": {"fr": "Erreur", "en": "Error"},

        # 2FA
        "2fa.title": {"fr": "Authentification à deux facteurs", "en": "Two-Factor Authentication"},
        "2fa.code": {"fr": "Code de vérification", "en": "Verification code"},
        "2fa.verify": {"fr": "Vérifier", "en": "Verify"},

        # Password
        "password.change": {"fr": "Changer le mot de passe", "en": "Change password"},
        "password.current": {"fr": "Mot de passe actuel", "en": "Current password"},
        "password.new": {"fr": "Nouveau mot de passe", "en": "New password"},
        "password.confirm": {"fr": "Confirmer le mot de passe", "en": "Confirm password"},
    },

    "core.users": {
        # Page principale
        "page.title": {"fr": "Utilisateurs", "en": "Users"},
        "page.description": {"fr": "Gestion des utilisateurs", "en": "User Management"},
        "breadcrumb.home": {"fr": "Accueil", "en": "Home"},
        "breadcrumb.users": {"fr": "Utilisateurs", "en": "Users"},

        # Actions
        "action.invite": {"fr": "Inviter un utilisateur", "en": "Invite user"},
        "action.create": {"fr": "Créer un utilisateur", "en": "Create user"},
        "action.edit": {"fr": "Modifier", "en": "Edit"},
        "action.delete": {"fr": "Supprimer", "en": "Delete"},
        "action.deactivate": {"fr": "Désactiver", "en": "Deactivate"},
        "action.activate": {"fr": "Activer", "en": "Activate"},
        "action.reset_password": {"fr": "Réinitialiser le mot de passe", "en": "Reset password"},
        "action.assign_roles": {"fr": "Assigner des rôles", "en": "Assign roles"},
        "action.assign_groups": {"fr": "Assigner à des groupes", "en": "Assign to groups"},
        "action.view_details": {"fr": "Voir les détails", "en": "View details"},

        # Champs
        "field.first_name": {"fr": "Prénom", "en": "First name"},
        "field.last_name": {"fr": "Nom", "en": "Last name"},
        "field.full_name": {"fr": "Nom complet", "en": "Full name"},
        "field.email": {"fr": "E-mail", "en": "Email"},
        "field.phone": {"fr": "Téléphone", "en": "Phone"},
        "field.role": {"fr": "Rôle", "en": "Role"},
        "field.roles": {"fr": "Rôles", "en": "Roles"},
        "field.group": {"fr": "Groupe", "en": "Group"},
        "field.groups": {"fr": "Groupes", "en": "Groups"},
        "field.status": {"fr": "Statut", "en": "Status"},
        "field.created_at": {"fr": "Créé le", "en": "Created at"},
        "field.updated_at": {"fr": "Modifié le", "en": "Updated at"},
        "field.last_login": {"fr": "Dernière connexion", "en": "Last login"},
        "field.is_active": {"fr": "Actif", "en": "Active"},
        "field.is_superuser": {"fr": "Super administrateur", "en": "Super admin"},

        # Stats
        "stats.total": {"fr": "Total utilisateurs", "en": "Total users"},
        "stats.total_desc": {"fr": "Nombre total d'utilisateurs", "en": "Total number of users"},
        "stats.total_count": {"fr": "{count} utilisateurs au total", "en": "{count} users in total"},
        "stats.active": {"fr": "Utilisateurs actifs", "en": "Active users"},
        "stats.active_desc": {"fr": "Utilisateurs avec statut actif", "en": "Users with active status"},
        "stats.inactive": {"fr": "Utilisateurs inactifs", "en": "Inactive users"},
        "stats.invited": {"fr": "Invitations en attente", "en": "Pending invitations"},
        "stats.invited_desc": {"fr": "Utilisateurs invités mais pas encore activés", "en": "Invited but not yet activated users"},
        "stats.new_this_month": {"fr": "Nouveaux utilisateurs", "en": "New users"},
        "stats.new_this_month_desc": {"fr": "Utilisateurs créés dans les 30 derniers jours", "en": "Users created in the last 30 days"},
        "stats.percentage_of_total": {"fr": "{percentage}% du total", "en": "{percentage}% of total"},

        # Table
        "table.no_results": {"fr": "Aucun utilisateur trouvé", "en": "No users found"},
        "table.loading": {"fr": "Chargement...", "en": "Loading..."},
        "table.rows_selected": {"fr": "{count} ligne(s) sélectionnée(s)", "en": "{count} row(s) selected"},
        "table.columns": {"fr": "Colonnes", "en": "Columns"},

        # Filtres
        "filter.all": {"fr": "Tous", "en": "All"},
        "filter.active": {"fr": "Actifs", "en": "Active"},
        "filter.inactive": {"fr": "Inactifs", "en": "Inactive"},
        "filter.search": {"fr": "Rechercher un utilisateur...", "en": "Search user..."},
        "filter.reset": {"fr": "Réinitialiser", "en": "Reset"},
        "filter.by_role": {"fr": "Par rôle", "en": "By role"},
        "filter.by_group": {"fr": "Par groupe", "en": "By group"},

        # Status
        "status.active": {"fr": "Actif", "en": "Active"},
        "status.inactive": {"fr": "Inactif", "en": "Inactive"},
        "status.invited": {"fr": "Invité", "en": "Invited"},
        "status.suspended": {"fr": "Suspendu", "en": "Suspended"},

        # Messages de succès
        "message.created": {"fr": "Utilisateur créé avec succès", "en": "User created successfully"},
        "message.updated": {"fr": "Utilisateur mis à jour", "en": "User updated"},
        "message.deleted": {"fr": "Utilisateur supprimé", "en": "User deleted"},
        "message.activated": {"fr": "Utilisateur activé", "en": "User activated"},
        "message.deactivated": {"fr": "Utilisateur désactivé", "en": "User deactivated"},
        "message.invitation_sent": {"fr": "Invitation envoyée à {email}", "en": "Invitation sent to {email}"},
        "message.password_reset": {"fr": "Lien de réinitialisation envoyé", "en": "Reset link sent"},
        "message.roles_assigned": {"fr": "Rôles assignés avec succès", "en": "Roles assigned successfully"},
        "message.groups_assigned": {"fr": "Groupes assignés avec succès", "en": "Groups assigned successfully"},

        # Messages d'erreur
        "error.load_failed": {"fr": "Impossible de charger les utilisateurs", "en": "Failed to load users"},
        "error.create_failed": {"fr": "Impossible de créer l'utilisateur", "en": "Failed to create user"},
        "error.update_failed": {"fr": "Impossible de mettre à jour l'utilisateur", "en": "Failed to update user"},
        "error.delete_failed": {"fr": "Impossible de supprimer l'utilisateur", "en": "Failed to delete user"},
        "error.email_exists": {"fr": "Cet e-mail existe déjà", "en": "This email already exists"},

        # Dialog - Inviter
        "invite.title": {"fr": "Inviter un utilisateur", "en": "Invite user"},
        "invite.description": {"fr": "Envoyer une invitation par e-mail", "en": "Send an email invitation"},
        "invite.email_label": {"fr": "Adresse e-mail", "en": "Email address"},
        "invite.email_placeholder": {"fr": "utilisateur@exemple.com", "en": "user@example.com"},
        "invite.role_label": {"fr": "Rôle", "en": "Role"},
        "invite.role_placeholder": {"fr": "Sélectionner un rôle", "en": "Select a role"},
        "invite.send": {"fr": "Envoyer l'invitation", "en": "Send invitation"},
        "invite.cancel": {"fr": "Annuler", "en": "Cancel"},

        # Dialog - Créer
        "create.title": {"fr": "Créer un utilisateur", "en": "Create user"},
        "create.description": {"fr": "Ajouter un nouvel utilisateur", "en": "Add a new user"},

        # Dialog - Modifier
        "edit.title": {"fr": "Modifier l'utilisateur", "en": "Edit user"},
        "edit.description": {"fr": "Modifier les informations de {name}", "en": "Edit {name}'s information"},

        # Dialog - Supprimer
        "delete.title": {"fr": "Supprimer l'utilisateur", "en": "Delete user"},
        "delete.description": {"fr": "Êtes-vous sûr de vouloir supprimer {name} ? Cette action est irréversible.", "en": "Are you sure you want to delete {name}? This action cannot be undone."},
        "delete.confirm": {"fr": "Oui, supprimer", "en": "Yes, delete"},
        "delete.cancel": {"fr": "Annuler", "en": "Cancel"},

        # Dialog - Désactiver
        "deactivate.title": {"fr": "Désactiver l'utilisateur", "en": "Deactivate user"},
        "deactivate.description": {"fr": "L'utilisateur {name} ne pourra plus se connecter", "en": "{name} will no longer be able to log in"},
        "deactivate.confirm": {"fr": "Désactiver", "en": "Deactivate"},

        # Permissions
        "permissions.title": {"fr": "Permissions", "en": "Permissions"},
        "permissions.direct": {"fr": "Permissions directes", "en": "Direct permissions"},
        "permissions.from_roles": {"fr": "Depuis les rôles", "en": "From roles"},
        "permissions.from_groups": {"fr": "Depuis les groupes", "en": "From groups"},
        "permissions.none": {"fr": "Aucune permission", "en": "No permissions"},

        # Détails utilisateur
        "detail.title": {"fr": "Détails de l'utilisateur", "en": "User details"},
        "detail.information": {"fr": "Informations", "en": "Information"},
        "detail.roles_groups": {"fr": "Rôles et groupes", "en": "Roles and groups"},
        "detail.activity": {"fr": "Activité", "en": "Activity"},
        "detail.no_roles": {"fr": "Aucun rôle assigné", "en": "No roles assigned"},
        "detail.no_groups": {"fr": "Aucun groupe assigné", "en": "No groups assigned"},
    },

    "core.groups": {
        "page.title": {"fr": "Groupes", "en": "Groups"},
        "page.description": {"fr": "Gérer les groupes d'utilisateurs", "en": "Manage user groups"},
        "action.create_group": {"fr": "Créer un groupe", "en": "Create group"},
        "field.name": {"fr": "Nom", "en": "Name"},
        "field.description": {"fr": "Description", "en": "Description"},
        "message.group_created": {"fr": "Groupe créé avec succès", "en": "Group created successfully"},
    },

    "core.rbac": {
        "roles.title": {"fr": "Rôles", "en": "Roles"},
        "roles.create": {"fr": "Créer un rôle", "en": "Create role"},
        "permissions.title": {"fr": "Permissions", "en": "Permissions"},
        "permissions.create": {"fr": "Créer une permission", "en": "Create permission"},
    },

    "core.settings": {
        "page.title": {"fr": "Paramètres", "en": "Settings"},
        "section.profile": {"fr": "Profil", "en": "Profile"},
        "section.security": {"fr": "Sécurité", "en": "Security"},
        "profile.first_name": {"fr": "Prénom", "en": "First name"},
        "profile.last_name": {"fr": "Nom", "en": "Last name"},
        "message.settings_saved": {"fr": "Paramètres enregistrés", "en": "Settings saved"},
    },

    "core.developers": {
        "api_keys.title": {"fr": "Clés API", "en": "API Keys"},
        "api_keys.create": {"fr": "Créer une clé API", "en": "Create API key"},
        "webhooks.title": {"fr": "Webhooks", "en": "Webhooks"},
        "hooks.title": {"fr": "Hooks", "en": "Hooks"},
        "logs.title": {"fr": "Événements & Logs", "en": "Events & Logs"},
    },

    "core.dashboard": {
        "title": {"fr": "Tableau de bord", "en": "Dashboard"},
        "welcome": {"fr": "Bienvenue", "en": "Welcome"},
        "overview": {"fr": "Vue d'ensemble", "en": "Overview"},
    },

    "core.tasks": {
        "page.title": {"fr": "Tâches", "en": "Tasks"},
        "action.create": {"fr": "Créer une tâche", "en": "Create task"},
        "field.title": {"fr": "Titre", "en": "Title"},
        "status.todo": {"fr": "À faire", "en": "To do"},
        "status.in_progress": {"fr": "En cours", "en": "In progress"},
        "status.done": {"fr": "Terminé", "en": "Done"},
    },
}


async def seed_all():
    """Crée tous les namespaces et traductions via SQL direct"""

    with engine.connect() as conn:
        # Récupérer les IDs des langues
        result = conn.execute(text("SELECT id, code FROM language WHERE code IN ('fr', 'en')"))
        langs = {row[1]: str(row[0]) for row in result}

        if 'fr' not in langs or 'en' not in langs:
            print("❌ Langues FR ou EN non trouvées")
            return

        print(f"✅ Langues: FR={langs['fr']}, EN={langs['en']}\n")

        total_created = 0

        for namespace_code, translations in TRANSLATIONS.items():
            print(f"🔄 {namespace_code}")

            # Vérifier si le namespace existe
            result = conn.execute(
                text("SELECT id FROM translation_namespace WHERE code = :code"),
                {"code": namespace_code}
            )
            row = result.fetchone()

            if not row:
                # Créer le namespace
                ns_id = str(uuid.uuid4())
                conn.execute(
                    text("""
                        INSERT INTO translation_namespace (id, code, name, description, namespace_type, created_at, updated_at)
                        VALUES (:id, :code, :name, :desc, 'core', NOW(), NOW())
                    """),
                    {
                        "id": ns_id,
                        "code": namespace_code,
                        "name": namespace_code.replace("core.", "Core ").title(),
                        "desc": f"Traductions pour {namespace_code}"
                    }
                )
                conn.commit()
                print(f"  ✨ Namespace créé: {ns_id}")
            else:
                ns_id = str(row[0])
                print(f"  ✓ Namespace existant: {ns_id}")

            # Créer les traductions
            created = 0
            for key, values in translations.items():
                for lang_code in ['fr', 'en']:
                    # Vérifier si la traduction existe
                    result = conn.execute(
                        text("""
                            SELECT id FROM translation
                            WHERE namespace_id = :ns_id
                            AND language_id = :lang_id
                            AND key = :key
                            AND deleted_at IS NULL
                        """),
                        {
                            "ns_id": ns_id,
                            "lang_id": langs[lang_code],
                            "key": key
                        }
                    )

                    if not result.fetchone():
                        # Créer la traduction
                        tr_id = str(uuid.uuid4())
                        conn.execute(
                            text("""
                                INSERT INTO translation (id, namespace_id, language_id, key, value, is_verified, created_at, updated_at)
                                VALUES (:id, :ns_id, :lang_id, :key, :value, true, NOW(), NOW())
                            """),
                            {
                                "id": tr_id,
                                "ns_id": ns_id,
                                "lang_id": langs[lang_code],
                                "key": key,
                                "value": values[lang_code]
                            }
                        )
                        created += 1

            conn.commit()
            print(f"  📊 {len(translations)} clés | {created} traductions créées\n")
            total_created += created

        print("=" * 60)
        print(f"✅ Terminé! {total_created} traductions créées")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(seed_all())
