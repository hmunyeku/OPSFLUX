"""
Script pour insérer TOUTES les traductions de l'application
Gère tous les namespaces: auth, users, rbac, settings, developers, common
"""

import asyncio
from sqlmodel import Session, select
from app.core.db import engine
from app.models_i18n import Language, TranslationNamespace, Translation


# Définition de tous les namespaces et traductions
NAMESPACES_DATA = {
    # ============ CORE: Common ============
    "core.common": {
        "name": "Core Common",
        "description": "Traductions communes utilisées dans toute l'application",
        "namespace_type": "core",
        "translations": {
            # Boutons actions
            "button.save": {"fr": "Enregistrer", "en": "Save"},
            "button.cancel": {"fr": "Annuler", "en": "Cancel"},
            "button.delete": {"fr": "Supprimer", "en": "Delete"},
            "button.edit": {"fr": "Modifier", "en": "Edit"},
            "button.create": {"fr": "Créer", "en": "Create"},
            "button.add": {"fr": "Ajouter", "en": "Add"},
            "button.remove": {"fr": "Retirer", "en": "Remove"},
            "button.close": {"fr": "Fermer", "en": "Close"},
            "button.confirm": {"fr": "Confirmer", "en": "Confirm"},
            "button.submit": {"fr": "Soumettre", "en": "Submit"},
            "button.search": {"fr": "Rechercher", "en": "Search"},
            "button.filter": {"fr": "Filtrer", "en": "Filter"},
            "button.export": {"fr": "Exporter", "en": "Export"},
            "button.import": {"fr": "Importer", "en": "Import"},
            "button.download": {"fr": "Télécharger", "en": "Download"},
            "button.upload": {"fr": "Upload", "en": "Upload"},
            "button.refresh": {"fr": "Actualiser", "en": "Refresh"},
            "button.back": {"fr": "Retour", "en": "Back"},
            "button.next": {"fr": "Suivant", "en": "Next"},
            "button.previous": {"fr": "Précédent", "en": "Previous"},
            "button.view": {"fr": "Voir", "en": "View"},
            "button.copy": {"fr": "Copier", "en": "Copy"},
            "button.duplicate": {"fr": "Dupliquer", "en": "Duplicate"},

            # Messages courants
            "message.loading": {"fr": "Chargement...", "en": "Loading..."},
            "message.success": {"fr": "Opération réussie", "en": "Operation successful"},
            "message.error": {"fr": "Une erreur est survenue", "en": "An error occurred"},
            "message.warning": {"fr": "Attention", "en": "Warning"},
            "message.info": {"fr": "Information", "en": "Information"},
            "message.no_data": {"fr": "Aucune donnée disponible", "en": "No data available"},
            "message.no_results": {"fr": "Aucun résultat", "en": "No results"},
            "message.confirm_delete": {"fr": "Êtes-vous sûr de vouloir supprimer cet élément ?", "en": "Are you sure you want to delete this item?"},
            "message.unsaved_changes": {"fr": "Vous avez des modifications non enregistrées", "en": "You have unsaved changes"},
            "message.required_field": {"fr": "Ce champ est requis", "en": "This field is required"},

            # Navigation
            "nav.home": {"fr": "Accueil", "en": "Home"},
            "nav.dashboard": {"fr": "Tableau de bord", "en": "Dashboard"},
            "nav.users": {"fr": "Utilisateurs", "en": "Users"},
            "nav.settings": {"fr": "Paramètres", "en": "Settings"},
            "nav.profile": {"fr": "Profil", "en": "Profile"},
            "nav.logout": {"fr": "Se déconnecter", "en": "Logout"},

            # Status
            "status.active": {"fr": "Actif", "en": "Active"},
            "status.inactive": {"fr": "Inactif", "en": "Inactive"},
            "status.pending": {"fr": "En attente", "en": "Pending"},
            "status.completed": {"fr": "Terminé", "en": "Completed"},
            "status.failed": {"fr": "Échoué", "en": "Failed"},
            "status.cancelled": {"fr": "Annulé", "en": "Cancelled"},

            # Temps
            "time.today": {"fr": "Aujourd'hui", "en": "Today"},
            "time.yesterday": {"fr": "Hier", "en": "Yesterday"},
            "time.this_week": {"fr": "Cette semaine", "en": "This week"},
            "time.this_month": {"fr": "Ce mois", "en": "This month"},
            "time.last_week": {"fr": "Semaine dernière", "en": "Last week"},
            "time.last_month": {"fr": "Mois dernier", "en": "Last month"},
        }
    },

    # ============ CORE: Auth ============
    "core.auth": {
        "name": "Core Authentication",
        "description": "Traductions pour l'authentification et sécurité",
        "namespace_type": "core",
        "translations": {
            # Login
            "login.title": {"fr": "Se connecter", "en": "Sign in"},
            "login.subtitle": {"fr": "Entrez vos identifiants pour accéder à votre compte", "en": "Enter your credentials to access your account"},
            "login.email": {"fr": "Adresse e-mail", "en": "Email address"},
            "login.password": {"fr": "Mot de passe", "en": "Password"},
            "login.remember_me": {"fr": "Se souvenir de moi", "en": "Remember me"},
            "login.forgot_password": {"fr": "Mot de passe oublié ?", "en": "Forgot password?"},
            "login.button": {"fr": "Se connecter", "en": "Sign in"},
            "login.no_account": {"fr": "Pas encore de compte ?", "en": "Don't have an account?"},
            "login.sign_up": {"fr": "S'inscrire", "en": "Sign up"},

            # Login errors
            "login.error.invalid_credentials": {"fr": "Identifiants invalides", "en": "Invalid credentials"},
            "login.error.account_locked": {"fr": "Votre compte est verrouillé", "en": "Your account is locked"},
            "login.error.account_inactive": {"fr": "Votre compte est inactif", "en": "Your account is inactive"},
            "login.error.too_many_attempts": {"fr": "Trop de tentatives. Réessayez plus tard", "en": "Too many attempts. Try again later"},

            # 2FA
            "2fa.title": {"fr": "Authentification à deux facteurs", "en": "Two-Factor Authentication"},
            "2fa.subtitle": {"fr": "Entrez le code de votre application d'authentification", "en": "Enter the code from your authenticator app"},
            "2fa.code": {"fr": "Code de vérification", "en": "Verification code"},
            "2fa.verify": {"fr": "Vérifier", "en": "Verify"},
            "2fa.setup": {"fr": "Configurer 2FA", "en": "Setup 2FA"},
            "2fa.disable": {"fr": "Désactiver 2FA", "en": "Disable 2FA"},
            "2fa.scan_qr": {"fr": "Scannez ce QR code avec votre application", "en": "Scan this QR code with your app"},
            "2fa.backup_codes": {"fr": "Codes de secours", "en": "Backup codes"},

            # Password
            "password.change": {"fr": "Changer le mot de passe", "en": "Change password"},
            "password.current": {"fr": "Mot de passe actuel", "en": "Current password"},
            "password.new": {"fr": "Nouveau mot de passe", "en": "New password"},
            "password.confirm": {"fr": "Confirmer le mot de passe", "en": "Confirm password"},
            "password.requirements": {"fr": "Le mot de passe doit contenir au moins 8 caractères", "en": "Password must contain at least 8 characters"},
            "password.reset": {"fr": "Réinitialiser le mot de passe", "en": "Reset password"},
            "password.reset_link_sent": {"fr": "Un lien de réinitialisation a été envoyé", "en": "Reset link has been sent"},

            # Session
            "session.expired": {"fr": "Votre session a expiré", "en": "Your session has expired"},
            "session.logout_success": {"fr": "Déconnexion réussie", "en": "Logged out successfully"},
        }
    },

    # ============ CORE: Users ============
    "core.users": {
        "name": "Core Users",
        "description": "Traductions pour la gestion des utilisateurs",
        "namespace_type": "core",
        "translations": {
            # Page principale
            "page.title": {"fr": "Utilisateurs", "en": "Users"},
            "page.description": {"fr": "Gérer les utilisateurs de l'application", "en": "Manage application users"},

            # Actions
            "action.invite_user": {"fr": "Inviter un utilisateur", "en": "Invite user"},
            "action.create_user": {"fr": "Créer un utilisateur", "en": "Create user"},
            "action.edit_user": {"fr": "Modifier l'utilisateur", "en": "Edit user"},
            "action.delete_user": {"fr": "Supprimer l'utilisateur", "en": "Delete user"},
            "action.deactivate_user": {"fr": "Désactiver l'utilisateur", "en": "Deactivate user"},
            "action.activate_user": {"fr": "Activer l'utilisateur", "en": "Activate user"},
            "action.reset_password": {"fr": "Réinitialiser le mot de passe", "en": "Reset password"},
            "action.assign_role": {"fr": "Assigner un rôle", "en": "Assign role"},
            "action.assign_group": {"fr": "Assigner à un groupe", "en": "Assign to group"},

            # Champs
            "field.first_name": {"fr": "Prénom", "en": "First name"},
            "field.last_name": {"fr": "Nom", "en": "Last name"},
            "field.email": {"fr": "E-mail", "en": "Email"},
            "field.phone": {"fr": "Téléphone", "en": "Phone"},
            "field.role": {"fr": "Rôle", "en": "Role"},
            "field.group": {"fr": "Groupe", "en": "Group"},
            "field.status": {"fr": "Statut", "en": "Status"},
            "field.created_at": {"fr": "Créé le", "en": "Created at"},
            "field.last_login": {"fr": "Dernière connexion", "en": "Last login"},

            # Stats
            "stats.total_users": {"fr": "Total utilisateurs", "en": "Total users"},
            "stats.active_users": {"fr": "Utilisateurs actifs", "en": "Active users"},
            "stats.inactive_users": {"fr": "Utilisateurs inactifs", "en": "Inactive users"},
            "stats.invited_users": {"fr": "Utilisateurs invités", "en": "Invited users"},

            # Messages
            "message.user_created": {"fr": "Utilisateur créé avec succès", "en": "User created successfully"},
            "message.user_updated": {"fr": "Utilisateur mis à jour", "en": "User updated"},
            "message.user_deleted": {"fr": "Utilisateur supprimé", "en": "User deleted"},
            "message.user_deactivated": {"fr": "Utilisateur désactivé", "en": "User deactivated"},
            "message.user_activated": {"fr": "Utilisateur activé", "en": "User activated"},
            "message.invitation_sent": {"fr": "Invitation envoyée", "en": "Invitation sent"},
            "message.confirm_delete": {"fr": "Êtes-vous sûr de vouloir supprimer {name} ?", "en": "Are you sure you want to delete {name}?"},

            # Filtres
            "filter.all": {"fr": "Tous", "en": "All"},
            "filter.active": {"fr": "Actifs", "en": "Active"},
            "filter.inactive": {"fr": "Inactifs", "en": "Inactive"},
            "filter.search_placeholder": {"fr": "Rechercher un utilisateur...", "en": "Search user..."},
        }
    },

    # ============ CORE: Groups ============
    "core.groups": {
        "name": "Core Groups",
        "description": "Traductions pour la gestion des groupes",
        "namespace_type": "core",
        "translations": {
            "page.title": {"fr": "Groupes", "en": "Groups"},
            "page.description": {"fr": "Gérer les groupes d'utilisateurs", "en": "Manage user groups"},

            "action.create_group": {"fr": "Créer un groupe", "en": "Create group"},
            "action.edit_group": {"fr": "Modifier le groupe", "en": "Edit group"},
            "action.delete_group": {"fr": "Supprimer le groupe", "en": "Delete group"},
            "action.manage_permissions": {"fr": "Gérer les permissions", "en": "Manage permissions"},
            "action.add_users": {"fr": "Ajouter des utilisateurs", "en": "Add users"},

            "field.name": {"fr": "Nom", "en": "Name"},
            "field.description": {"fr": "Description", "en": "Description"},
            "field.users_count": {"fr": "Nombre d'utilisateurs", "en": "Users count"},
            "field.permissions_count": {"fr": "Nombre de permissions", "en": "Permissions count"},

            "message.group_created": {"fr": "Groupe créé avec succès", "en": "Group created successfully"},
            "message.group_updated": {"fr": "Groupe mis à jour", "en": "Group updated"},
            "message.group_deleted": {"fr": "Groupe supprimé", "en": "Group deleted"},
            "message.confirm_delete": {"fr": "Supprimer le groupe {name} ?", "en": "Delete group {name}?"},
        }
    },

    # ============ CORE: RBAC (Roles & Permissions) ============
    "core.rbac": {
        "name": "Core RBAC",
        "description": "Traductions pour les rôles et permissions",
        "namespace_type": "core",
        "translations": {
            # Roles
            "roles.title": {"fr": "Rôles", "en": "Roles"},
            "roles.description": {"fr": "Gérer les rôles et leurs permissions", "en": "Manage roles and their permissions"},
            "roles.create": {"fr": "Créer un rôle", "en": "Create role"},
            "roles.edit": {"fr": "Modifier le rôle", "en": "Edit role"},
            "roles.delete": {"fr": "Supprimer le rôle", "en": "Delete role"},
            "roles.assign": {"fr": "Assigner des rôles", "en": "Assign roles"},
            "roles.field.name": {"fr": "Nom du rôle", "en": "Role name"},
            "roles.field.code": {"fr": "Code", "en": "Code"},
            "roles.field.description": {"fr": "Description", "en": "Description"},
            "roles.field.permissions": {"fr": "Permissions", "en": "Permissions"},
            "roles.message.created": {"fr": "Rôle créé avec succès", "en": "Role created successfully"},
            "roles.message.updated": {"fr": "Rôle mis à jour", "en": "Role updated"},
            "roles.message.deleted": {"fr": "Rôle supprimé", "en": "Role deleted"},

            # Permissions
            "permissions.title": {"fr": "Permissions", "en": "Permissions"},
            "permissions.description": {"fr": "Gérer les permissions système", "en": "Manage system permissions"},
            "permissions.create": {"fr": "Créer une permission", "en": "Create permission"},
            "permissions.edit": {"fr": "Modifier la permission", "en": "Edit permission"},
            "permissions.delete": {"fr": "Supprimer la permission", "en": "Delete permission"},
            "permissions.field.name": {"fr": "Nom de la permission", "en": "Permission name"},
            "permissions.field.code": {"fr": "Code", "en": "Code"},
            "permissions.field.module": {"fr": "Module", "en": "Module"},
            "permissions.field.action": {"fr": "Action", "en": "Action"},
            "permissions.message.created": {"fr": "Permission créée avec succès", "en": "Permission created successfully"},
            "permissions.message.updated": {"fr": "Permission mise à jour", "en": "Permission updated"},
            "permissions.message.deleted": {"fr": "Permission supprimée", "en": "Permission deleted"},

            # Actions
            "action.create": {"fr": "Créer", "en": "Create"},
            "action.read": {"fr": "Lire", "en": "Read"},
            "action.update": {"fr": "Mettre à jour", "en": "Update"},
            "action.delete": {"fr": "Supprimer", "en": "Delete"},
            "action.manage": {"fr": "Gérer", "en": "Manage"},
        }
    },

    # ============ CORE: Settings ============
    "core.settings": {
        "name": "Core Settings",
        "description": "Traductions pour les paramètres",
        "namespace_type": "core",
        "translations": {
            "page.title": {"fr": "Paramètres", "en": "Settings"},
            "page.description": {"fr": "Configurer les paramètres de l'application", "en": "Configure application settings"},

            # Sections
            "section.profile": {"fr": "Profil", "en": "Profile"},
            "section.security": {"fr": "Sécurité", "en": "Security"},
            "section.notifications": {"fr": "Notifications", "en": "Notifications"},
            "section.preferences": {"fr": "Préférences", "en": "Preferences"},
            "section.billing": {"fr": "Facturation", "en": "Billing"},
            "section.connected_apps": {"fr": "Applications connectées", "en": "Connected apps"},
            "section.emailing": {"fr": "E-mailing", "en": "Emailing"},
            "section.modules": {"fr": "Modules", "en": "Modules"},

            # Profile
            "profile.title": {"fr": "Informations du profil", "en": "Profile information"},
            "profile.description": {"fr": "Gérer vos informations personnelles", "en": "Manage your personal information"},
            "profile.avatar": {"fr": "Photo de profil", "en": "Profile picture"},
            "profile.change_avatar": {"fr": "Changer la photo", "en": "Change picture"},
            "profile.first_name": {"fr": "Prénom", "en": "First name"},
            "profile.last_name": {"fr": "Nom", "en": "Last name"},
            "profile.email": {"fr": "E-mail", "en": "Email"},
            "profile.phone": {"fr": "Téléphone", "en": "Phone"},
            "profile.language": {"fr": "Langue", "en": "Language"},
            "profile.timezone": {"fr": "Fuseau horaire", "en": "Timezone"},

            # Security
            "security.title": {"fr": "Sécurité", "en": "Security"},
            "security.description": {"fr": "Gérer vos paramètres de sécurité", "en": "Manage your security settings"},
            "security.change_password": {"fr": "Changer le mot de passe", "en": "Change password"},
            "security.2fa": {"fr": "Authentification à deux facteurs", "en": "Two-factor authentication"},
            "security.2fa_enabled": {"fr": "2FA activé", "en": "2FA enabled"},
            "security.2fa_disabled": {"fr": "2FA désactivé", "en": "2FA disabled"},
            "security.sessions": {"fr": "Sessions actives", "en": "Active sessions"},
            "security.logout_all": {"fr": "Déconnecter toutes les sessions", "en": "Logout all sessions"},

            # Notifications
            "notifications.title": {"fr": "Notifications", "en": "Notifications"},
            "notifications.description": {"fr": "Gérer vos préférences de notification", "en": "Manage your notification preferences"},
            "notifications.email": {"fr": "Notifications par e-mail", "en": "Email notifications"},
            "notifications.push": {"fr": "Notifications push", "en": "Push notifications"},
            "notifications.sms": {"fr": "Notifications SMS", "en": "SMS notifications"},

            # Messages
            "message.settings_saved": {"fr": "Paramètres enregistrés", "en": "Settings saved"},
            "message.profile_updated": {"fr": "Profil mis à jour", "en": "Profile updated"},
            "message.password_changed": {"fr": "Mot de passe modifié", "en": "Password changed"},
        }
    },

    # ============ CORE: Developers ============
    "core.developers": {
        "name": "Core Developers",
        "description": "Traductions pour l'espace développeurs",
        "namespace_type": "core",
        "translations": {
            # API Keys
            "api_keys.title": {"fr": "Clés API", "en": "API Keys"},
            "api_keys.description": {"fr": "Gérer vos clés d'API", "en": "Manage your API keys"},
            "api_keys.create": {"fr": "Créer une clé API", "en": "Create API key"},
            "api_keys.name": {"fr": "Nom de la clé", "en": "Key name"},
            "api_keys.key": {"fr": "Clé", "en": "Key"},
            "api_keys.secret": {"fr": "Secret", "en": "Secret"},
            "api_keys.created_at": {"fr": "Créée le", "en": "Created at"},
            "api_keys.expires_at": {"fr": "Expire le", "en": "Expires at"},
            "api_keys.revoke": {"fr": "Révoquer", "en": "Revoke"},
            "api_keys.message.created": {"fr": "Clé API créée. Copiez-la maintenant, elle ne sera plus affichée.", "en": "API key created. Copy it now, it won't be shown again."},
            "api_keys.message.revoked": {"fr": "Clé API révoquée", "en": "API key revoked"},

            # Webhooks
            "webhooks.title": {"fr": "Webhooks", "en": "Webhooks"},
            "webhooks.description": {"fr": "Gérer les webhooks", "en": "Manage webhooks"},
            "webhooks.create": {"fr": "Créer un webhook", "en": "Create webhook"},
            "webhooks.url": {"fr": "URL", "en": "URL"},
            "webhooks.events": {"fr": "Événements", "en": "Events"},
            "webhooks.status": {"fr": "Statut", "en": "Status"},
            "webhooks.last_triggered": {"fr": "Dernier déclenchement", "en": "Last triggered"},
            "webhooks.test": {"fr": "Tester", "en": "Test"},
            "webhooks.message.created": {"fr": "Webhook créé", "en": "Webhook created"},
            "webhooks.message.deleted": {"fr": "Webhook supprimé", "en": "Webhook deleted"},
            "webhooks.message.tested": {"fr": "Webhook testé", "en": "Webhook tested"},

            # Hooks
            "hooks.title": {"fr": "Hooks", "en": "Hooks"},
            "hooks.description": {"fr": "Gérer les hooks système", "en": "Manage system hooks"},
            "hooks.create": {"fr": "Créer un hook", "en": "Create hook"},
            "hooks.name": {"fr": "Nom", "en": "Name"},
            "hooks.event": {"fr": "Événement", "en": "Event"},
            "hooks.script": {"fr": "Script", "en": "Script"},
            "hooks.enabled": {"fr": "Activé", "en": "Enabled"},
            "hooks.message.created": {"fr": "Hook créé", "en": "Hook created"},
            "hooks.message.updated": {"fr": "Hook mis à jour", "en": "Hook updated"},
            "hooks.message.deleted": {"fr": "Hook supprimé", "en": "Hook deleted"},

            # Events & Logs
            "logs.title": {"fr": "Événements & Logs", "en": "Events & Logs"},
            "logs.description": {"fr": "Consulter les logs d'audit", "en": "View audit logs"},
            "logs.event": {"fr": "Événement", "en": "Event"},
            "logs.user": {"fr": "Utilisateur", "en": "User"},
            "logs.timestamp": {"fr": "Date/Heure", "en": "Timestamp"},
            "logs.ip_address": {"fr": "Adresse IP", "en": "IP Address"},
            "logs.details": {"fr": "Détails", "en": "Details"},
            "logs.filter.all_events": {"fr": "Tous les événements", "en": "All events"},
            "logs.filter.date_range": {"fr": "Période", "en": "Date range"},
        }
    },

    # ============ CORE: Dashboard ============
    "core.dashboard": {
        "name": "Core Dashboard",
        "description": "Traductions pour le tableau de bord",
        "namespace_type": "core",
        "translations": {
            "title": {"fr": "Tableau de bord", "en": "Dashboard"},
            "welcome": {"fr": "Bienvenue", "en": "Welcome"},
            "overview": {"fr": "Vue d'ensemble", "en": "Overview"},
            "analytics": {"fr": "Analytiques", "en": "Analytics"},

            # Stats
            "stats.total_users": {"fr": "Utilisateurs totaux", "en": "Total users"},
            "stats.active_users": {"fr": "Utilisateurs actifs", "en": "Active users"},
            "stats.total_revenue": {"fr": "Revenu total", "en": "Total revenue"},
            "stats.growth": {"fr": "Croissance", "en": "Growth"},

            # Widgets
            "widget.recent_activity": {"fr": "Activité récente", "en": "Recent activity"},
            "widget.quick_actions": {"fr": "Actions rapides", "en": "Quick actions"},
            "widget.notifications": {"fr": "Notifications", "en": "Notifications"},
        }
    },

    # ============ CORE: Tasks ============
    "core.tasks": {
        "name": "Core Tasks",
        "description": "Traductions pour la gestion des tâches",
        "namespace_type": "core",
        "translations": {
            "page.title": {"fr": "Tâches", "en": "Tasks"},
            "page.description": {"fr": "Gérer vos tâches", "en": "Manage your tasks"},

            "action.create": {"fr": "Créer une tâche", "en": "Create task"},
            "action.edit": {"fr": "Modifier la tâche", "en": "Edit task"},
            "action.delete": {"fr": "Supprimer la tâche", "en": "Delete task"},
            "action.complete": {"fr": "Marquer comme terminée", "en": "Mark as complete"},

            "field.title": {"fr": "Titre", "en": "Title"},
            "field.description": {"fr": "Description", "en": "Description"},
            "field.status": {"fr": "Statut", "en": "Status"},
            "field.priority": {"fr": "Priorité", "en": "Priority"},
            "field.assignee": {"fr": "Assigné à", "en": "Assigned to"},
            "field.due_date": {"fr": "Date d'échéance", "en": "Due date"},

            "status.todo": {"fr": "À faire", "en": "To do"},
            "status.in_progress": {"fr": "En cours", "en": "In progress"},
            "status.done": {"fr": "Terminé", "en": "Done"},

            "priority.low": {"fr": "Basse", "en": "Low"},
            "priority.medium": {"fr": "Moyenne", "en": "Medium"},
            "priority.high": {"fr": "Haute", "en": "High"},
            "priority.urgent": {"fr": "Urgente", "en": "Urgent"},
        }
    },
}


async def seed_all_translations():
    """Crée tous les namespaces et traductions de l'application"""

    with Session(engine) as session:
        # Récupérer les langues FR et EN
        fr_lang = session.exec(
            select(Language).where(Language.code == "fr")
        ).first()

        en_lang = session.exec(
            select(Language).where(Language.code == "en")
        ).first()

        if not fr_lang or not en_lang:
            print("❌ Langues FR ou EN non trouvées. Veuillez d'abord exécuter les migrations.")
            return

        print(f"✅ Langues trouvées: FR ({fr_lang.id}), EN ({en_lang.id})")
        print(f"\n📦 Traitement de {len(NAMESPACES_DATA)} namespaces...\n")

        total_created = 0
        total_skipped = 0
        total_keys = 0

        for namespace_code, namespace_data in NAMESPACES_DATA.items():
            print(f"🔄 Traitement du namespace: {namespace_code}")

            # Créer ou récupérer le namespace
            existing_ns = session.exec(
                select(TranslationNamespace).where(
                    TranslationNamespace.code == namespace_code
                )
            ).first()

            if not existing_ns:
                new_ns = TranslationNamespace(
                    code=namespace_code,
                    name=namespace_data["name"],
                    description=namespace_data["description"],
                    namespace_type=namespace_data["namespace_type"],
                    module_id=None  # Pas de module pour les namespaces CORE
                )
                session.add(new_ns)
                try:
                    session.commit()
                    session.refresh(new_ns)
                    namespace = new_ns
                    print(f"  ✨ Namespace créé")
                except Exception as e:
                    session.rollback()
                    print(f"  ⚠️  Erreur création namespace: {e}")
                    # Tenter de récupérer le namespace s'il existe déjà
                    existing_ns = session.exec(
                        select(TranslationNamespace).where(
                            TranslationNamespace.code == namespace_code
                        )
                    ).first()
                    if existing_ns:
                        namespace = existing_ns
                        print(f"  ✓ Namespace récupéré après erreur")
                    else:
                        print(f"  ❌ Impossible de créer/récupérer le namespace")
                        continue
            else:
                namespace = existing_ns
                print(f"  ✓ Namespace existant")

            # Créer les traductions
            created_count = 0
            skipped_count = 0

            for key, values in namespace_data["translations"].items():
                # Traduction FR
                existing_fr = session.exec(
                    select(Translation).where(
                        Translation.namespace_id == namespace.id,
                        Translation.language_id == fr_lang.id,
                        Translation.key == key,
                        Translation.deleted_at == None
                    )
                ).first()

                if not existing_fr:
                    translation_fr = Translation(
                        namespace_id=namespace.id,
                        language_id=fr_lang.id,
                        key=key,
                        value=values["fr"],
                        is_verified=True
                    )
                    session.add(translation_fr)
                    created_count += 1
                else:
                    skipped_count += 1

                # Traduction EN
                existing_en = session.exec(
                    select(Translation).where(
                        Translation.namespace_id == namespace.id,
                        Translation.language_id == en_lang.id,
                        Translation.key == key,
                        Translation.deleted_at == None
                    )
                ).first()

                if not existing_en:
                    translation_en = Translation(
                        namespace_id=namespace.id,
                        language_id=en_lang.id,
                        key=key,
                        value=values["en"],
                        is_verified=True
                    )
                    session.add(translation_en)
                    created_count += 1
                else:
                    skipped_count += 1

            session.commit()

            keys_count = len(namespace_data["translations"])
            total_keys += keys_count
            total_created += created_count
            total_skipped += skipped_count

            print(f"  📊 {keys_count} clés | {created_count} créées | {skipped_count} ignorées\n")

        print("=" * 60)
        print(f"✅ Seed terminé avec succès!")
        print(f"📦 Namespaces traités: {len(NAMESPACES_DATA)}")
        print(f"🔑 Total de clés: {total_keys}")
        print(f"✨ Traductions créées: {total_created}")
        print(f"⏭️  Traductions ignorées: {total_skipped}")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(seed_all_translations())
