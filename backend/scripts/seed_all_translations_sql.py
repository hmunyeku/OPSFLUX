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
        "page.title": {"fr": "Utilisateurs", "en": "Users"},
        "page.description": {"fr": "Gérer les utilisateurs de l'application", "en": "Manage application users"},
        "action.invite_user": {"fr": "Inviter un utilisateur", "en": "Invite user"},
        "action.create_user": {"fr": "Créer un utilisateur", "en": "Create user"},
        "field.first_name": {"fr": "Prénom", "en": "First name"},
        "field.last_name": {"fr": "Nom", "en": "Last name"},
        "field.email": {"fr": "E-mail", "en": "Email"},
        "field.status": {"fr": "Statut", "en": "Status"},
        "message.user_created": {"fr": "Utilisateur créé avec succès", "en": "User created successfully"},
        "filter.search_placeholder": {"fr": "Rechercher un utilisateur...", "en": "Search user..."},
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
