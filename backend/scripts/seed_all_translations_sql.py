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
        # Page principale
        "page.title": {"fr": "Groupes", "en": "Groups"},
        "page.description": {"fr": "Gérer les groupes d'utilisateurs", "en": "Manage user groups"},

        # Breadcrumb
        "breadcrumb.home": {"fr": "Accueil", "en": "Home"},
        "breadcrumb.groups": {"fr": "Groupes", "en": "Groups"},

        # Actions
        "action.create": {"fr": "Créer un groupe", "en": "Create group"},
        "action.create_group": {"fr": "Créer un groupe", "en": "Create group"},
        "action.edit": {"fr": "Modifier", "en": "Edit"},
        "action.delete": {"fr": "Supprimer", "en": "Delete"},
        "action.add_members": {"fr": "Ajouter des membres", "en": "Add members"},
        "action.remove_members": {"fr": "Retirer des membres", "en": "Remove members"},
        "action.view_details": {"fr": "Voir les détails", "en": "View details"},
        "action.assign_permissions": {"fr": "Assigner des permissions", "en": "Assign permissions"},

        # Champs
        "field.name": {"fr": "Nom", "en": "Name"},
        "field.code": {"fr": "Code", "en": "Code"},
        "field.description": {"fr": "Description", "en": "Description"},
        "field.members": {"fr": "Membres", "en": "Members"},
        "field.members_count": {"fr": "Nombre de membres", "en": "Members count"},
        "field.parent_group": {"fr": "Groupe parent", "en": "Parent group"},
        "field.permissions": {"fr": "Permissions", "en": "Permissions"},
        "field.created_at": {"fr": "Créé le", "en": "Created at"},
        "field.updated_at": {"fr": "Modifié le", "en": "Updated at"},

        # Stats
        "stats.total": {"fr": "Total groupes", "en": "Total groups"},
        "stats.total_desc": {"fr": "Nombre total de groupes", "en": "Total number of groups"},
        "stats.active": {"fr": "Groupes actifs", "en": "Active groups"},
        "stats.active_desc": {"fr": "Groupes avec membres actifs", "en": "Groups with active members"},
        "stats.members_count": {"fr": "Membres", "en": "Members"},
        "stats.members_count_desc": {"fr": "Nombre total de membres", "en": "Total number of members"},

        # Table
        "table.no_results": {"fr": "Aucun groupe trouvé", "en": "No groups found"},
        "table.loading": {"fr": "Chargement...", "en": "Loading..."},
        "table.columns": {"fr": "Colonnes", "en": "Columns"},

        # Filtres
        "filter.search": {"fr": "Rechercher un groupe...", "en": "Search group..."},
        "filter.by_type": {"fr": "Par type", "en": "By type"},
        "filter.reset": {"fr": "Réinitialiser", "en": "Reset"},
        "filter.all": {"fr": "Tous", "en": "All"},

        # Messages de succès
        "message.created": {"fr": "Groupe créé avec succès", "en": "Group created successfully"},
        "message.group_created": {"fr": "Groupe créé avec succès", "en": "Group created successfully"},
        "message.updated": {"fr": "Groupe mis à jour", "en": "Group updated"},
        "message.deleted": {"fr": "Groupe supprimé", "en": "Group deleted"},
        "message.members_added": {"fr": "Membres ajoutés avec succès", "en": "Members added successfully"},
        "message.members_removed": {"fr": "Membres retirés avec succès", "en": "Members removed successfully"},

        # Messages d'erreur
        "error.load_failed": {"fr": "Impossible de charger les groupes", "en": "Failed to load groups"},
        "error.create_failed": {"fr": "Impossible de créer le groupe", "en": "Failed to create group"},
        "error.update_failed": {"fr": "Impossible de mettre à jour le groupe", "en": "Failed to update group"},
        "error.delete_failed": {"fr": "Impossible de supprimer le groupe", "en": "Failed to delete group"},
        "error.name_exists": {"fr": "Ce nom de groupe existe déjà", "en": "This group name already exists"},

        # Dialog - Créer
        "dialog.create.title": {"fr": "Créer un groupe", "en": "Create group"},
        "dialog.create.description": {"fr": "Ajouter un nouveau groupe d'utilisateurs", "en": "Add a new user group"},

        # Dialog - Modifier
        "dialog.edit.title": {"fr": "Modifier le groupe", "en": "Edit group"},
        "dialog.edit.description": {"fr": "Modifier les informations du groupe", "en": "Edit group information"},

        # Dialog - Supprimer
        "dialog.delete.title": {"fr": "Supprimer le groupe", "en": "Delete group"},
        "dialog.delete.description": {"fr": "Êtes-vous sûr de vouloir supprimer ce groupe ? Cette action est irréversible.", "en": "Are you sure you want to delete this group? This action cannot be undone."},
        "dialog.delete.confirm": {"fr": "Oui, supprimer", "en": "Yes, delete"},
        "dialog.delete.cancel": {"fr": "Annuler", "en": "Cancel"},

        # Dialog - Ajouter des membres
        "dialog.add_members.title": {"fr": "Ajouter des membres", "en": "Add members"},
        "dialog.add_members.description": {"fr": "Sélectionner les utilisateurs à ajouter", "en": "Select users to add"},
    },

    "core.rbac": {
        # Page principale
        "page.title": {"fr": "Gestion des rôles et permissions", "en": "Roles and permissions management"},
        "page.description": {"fr": "Gérer les rôles, permissions et contrôle d'accès", "en": "Manage roles, permissions and access control"},

        # Breadcrumb
        "breadcrumb.home": {"fr": "Accueil", "en": "Home"},
        "breadcrumb.rbac": {"fr": "RBAC", "en": "RBAC"},
        "breadcrumb.roles": {"fr": "Rôles", "en": "Roles"},
        "breadcrumb.permissions": {"fr": "Permissions", "en": "Permissions"},

        # Rôles - Titre et actions
        "roles.title": {"fr": "Rôles", "en": "Roles"},
        "roles.create": {"fr": "Créer un rôle", "en": "Create role"},
        "roles.edit": {"fr": "Modifier le rôle", "en": "Edit role"},
        "roles.delete": {"fr": "Supprimer le rôle", "en": "Delete role"},
        "roles.assign": {"fr": "Assigner le rôle", "en": "Assign role"},
        "roles.list": {"fr": "Liste des rôles", "en": "Roles list"},
        "roles.detail": {"fr": "Détails du rôle", "en": "Role details"},
        "roles.view": {"fr": "Voir le rôle", "en": "View role"},

        # Permissions - Titre et actions
        "permissions.title": {"fr": "Permissions", "en": "Permissions"},
        "permissions.create": {"fr": "Créer une permission", "en": "Create permission"},
        "permissions.edit": {"fr": "Modifier la permission", "en": "Edit permission"},
        "permissions.delete": {"fr": "Supprimer la permission", "en": "Delete permission"},
        "permissions.assign": {"fr": "Assigner des permissions", "en": "Assign permissions"},
        "permissions.list": {"fr": "Liste des permissions", "en": "Permissions list"},
        "permissions.categories": {"fr": "Catégories de permissions", "en": "Permission categories"},
        "permissions.detail": {"fr": "Détails de la permission", "en": "Permission details"},

        # Champs
        "field.name": {"fr": "Nom", "en": "Name"},
        "field.code": {"fr": "Code", "en": "Code"},
        "field.description": {"fr": "Description", "en": "Description"},
        "field.permissions": {"fr": "Permissions", "en": "Permissions"},
        "field.users": {"fr": "Utilisateurs", "en": "Users"},
        "field.users_count": {"fr": "Nombre d'utilisateurs", "en": "Users count"},
        "field.module": {"fr": "Module", "en": "Module"},
        "field.action": {"fr": "Action", "en": "Action"},
        "field.resource": {"fr": "Ressource", "en": "Resource"},
        "field.created_at": {"fr": "Créé le", "en": "Created at"},
        "field.updated_at": {"fr": "Modifié le", "en": "Updated at"},
        "field.is_system": {"fr": "Rôle système", "en": "System role"},
        "field.is_custom": {"fr": "Rôle personnalisé", "en": "Custom role"},

        # Stats
        "stats.total_roles": {"fr": "Total rôles", "en": "Total roles"},
        "stats.total_roles_desc": {"fr": "Nombre total de rôles", "en": "Total number of roles"},
        "stats.total_permissions": {"fr": "Total permissions", "en": "Total permissions"},
        "stats.total_permissions_desc": {"fr": "Nombre total de permissions", "en": "Total number of permissions"},
        "stats.custom_roles": {"fr": "Rôles personnalisés", "en": "Custom roles"},
        "stats.custom_roles_desc": {"fr": "Rôles créés par les utilisateurs", "en": "User-created roles"},
        "stats.system_roles": {"fr": "Rôles système", "en": "System roles"},

        # Table
        "table.no_results": {"fr": "Aucun résultat trouvé", "en": "No results found"},
        "table.loading": {"fr": "Chargement...", "en": "Loading..."},
        "table.columns": {"fr": "Colonnes", "en": "Columns"},
        "table.no_roles": {"fr": "Aucun rôle trouvé", "en": "No roles found"},
        "table.no_permissions": {"fr": "Aucune permission trouvée", "en": "No permissions found"},

        # Filtres
        "filter.search": {"fr": "Rechercher...", "en": "Search..."},
        "filter.by_module": {"fr": "Par module", "en": "By module"},
        "filter.by_type": {"fr": "Par type", "en": "By type"},
        "filter.reset": {"fr": "Réinitialiser", "en": "Reset"},
        "filter.all": {"fr": "Tous", "en": "All"},
        "filter.system": {"fr": "Système", "en": "System"},
        "filter.custom": {"fr": "Personnalisé", "en": "Custom"},

        # Messages de succès
        "message.role_created": {"fr": "Rôle créé avec succès", "en": "Role created successfully"},
        "message.role_updated": {"fr": "Rôle mis à jour", "en": "Role updated"},
        "message.role_deleted": {"fr": "Rôle supprimé", "en": "Role deleted"},
        "message.permission_created": {"fr": "Permission créée avec succès", "en": "Permission created successfully"},
        "message.permission_updated": {"fr": "Permission mise à jour", "en": "Permission updated"},
        "message.permission_deleted": {"fr": "Permission supprimée", "en": "Permission deleted"},
        "message.permission_assigned": {"fr": "Permissions assignées avec succès", "en": "Permissions assigned successfully"},
        "message.role_assigned": {"fr": "Rôle assigné avec succès", "en": "Role assigned successfully"},

        # Messages d'erreur
        "error.load_failed": {"fr": "Impossible de charger les données", "en": "Failed to load data"},
        "error.create_failed": {"fr": "Impossible de créer", "en": "Failed to create"},
        "error.update_failed": {"fr": "Impossible de mettre à jour", "en": "Failed to update"},
        "error.delete_failed": {"fr": "Impossible de supprimer", "en": "Failed to delete"},
        "error.system_role": {"fr": "Impossible de modifier un rôle système", "en": "Cannot modify system role"},
        "error.code_exists": {"fr": "Ce code existe déjà", "en": "This code already exists"},

        # Dialog - Créer rôle
        "dialog.create_role.title": {"fr": "Créer un rôle", "en": "Create role"},
        "dialog.create_role.description": {"fr": "Ajouter un nouveau rôle personnalisé", "en": "Add a new custom role"},

        # Dialog - Modifier rôle
        "dialog.edit_role.title": {"fr": "Modifier le rôle", "en": "Edit role"},
        "dialog.edit_role.description": {"fr": "Modifier les informations du rôle", "en": "Edit role information"},

        # Dialog - Supprimer rôle
        "dialog.delete_role.title": {"fr": "Supprimer le rôle", "en": "Delete role"},
        "dialog.delete_role.description": {"fr": "Êtes-vous sûr de vouloir supprimer ce rôle ? Cette action est irréversible.", "en": "Are you sure you want to delete this role? This action cannot be undone."},
        "dialog.delete_role.confirm": {"fr": "Oui, supprimer", "en": "Yes, delete"},
        "dialog.delete_role.cancel": {"fr": "Annuler", "en": "Cancel"},

        # Dialog - Assigner permissions
        "dialog.assign_permissions.title": {"fr": "Assigner des permissions", "en": "Assign permissions"},
        "dialog.assign_permissions.description": {"fr": "Sélectionner les permissions pour ce rôle", "en": "Select permissions for this role"},
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
        # Page principale
        "page.title": {"fr": "Développeurs", "en": "Developers"},
        "page.description": {"fr": "Outils pour les développeurs", "en": "Developer tools"},

        # API Keys
        "api_keys.title": {"fr": "Clés API", "en": "API Keys"},
        "api_keys.create": {"fr": "Créer une clé API", "en": "Create API key"},
        "api_keys.revoke": {"fr": "Révoquer", "en": "Revoke"},
        "api_keys.regenerate": {"fr": "Régénérer", "en": "Regenerate"},
        "api_keys.list": {"fr": "Liste des clés API", "en": "API keys list"},
        "api_keys.detail": {"fr": "Détails de la clé", "en": "Key details"},
        "api_keys.copy": {"fr": "Copier la clé", "en": "Copy key"},
        "api_keys.expires_at": {"fr": "Expire le", "en": "Expires at"},
        "api_keys.scopes": {"fr": "Portées", "en": "Scopes"},
        "api_keys.last_used": {"fr": "Dernière utilisation", "en": "Last used"},
        "api_keys.never_used": {"fr": "Jamais utilisée", "en": "Never used"},
        "api_keys.name": {"fr": "Nom de la clé", "en": "Key name"},
        "api_keys.description": {"fr": "Description", "en": "Description"},

        # Webhooks
        "webhooks.title": {"fr": "Webhooks", "en": "Webhooks"},
        "webhooks.create": {"fr": "Créer un webhook", "en": "Create webhook"},
        "webhooks.edit": {"fr": "Modifier le webhook", "en": "Edit webhook"},
        "webhooks.delete": {"fr": "Supprimer le webhook", "en": "Delete webhook"},
        "webhooks.test": {"fr": "Tester", "en": "Test"},
        "webhooks.list": {"fr": "Liste des webhooks", "en": "Webhooks list"},
        "webhooks.url": {"fr": "URL du webhook", "en": "Webhook URL"},
        "webhooks.events": {"fr": "Événements", "en": "Events"},
        "webhooks.secret": {"fr": "Secret", "en": "Secret"},
        "webhooks.status": {"fr": "Statut", "en": "Status"},
        "webhooks.active": {"fr": "Actif", "en": "Active"},
        "webhooks.inactive": {"fr": "Inactif", "en": "Inactive"},
        "webhooks.last_triggered": {"fr": "Dernier déclenchement", "en": "Last triggered"},

        # Hooks
        "hooks.title": {"fr": "Hooks", "en": "Hooks"},
        "hooks.create": {"fr": "Créer un hook", "en": "Create hook"},
        "hooks.edit": {"fr": "Modifier le hook", "en": "Edit hook"},
        "hooks.delete": {"fr": "Supprimer le hook", "en": "Delete hook"},
        "hooks.enable": {"fr": "Activer", "en": "Enable"},
        "hooks.disable": {"fr": "Désactiver", "en": "Disable"},
        "hooks.trigger": {"fr": "Déclencher", "en": "Trigger"},
        "hooks.event": {"fr": "Événement", "en": "Event"},
        "hooks.action": {"fr": "Action", "en": "Action"},
        "hooks.condition": {"fr": "Condition", "en": "Condition"},

        # Logs
        "logs.title": {"fr": "Événements & Logs", "en": "Events & Logs"},
        "logs.filter": {"fr": "Filtrer", "en": "Filter"},
        "logs.search": {"fr": "Rechercher dans les logs...", "en": "Search logs..."},
        "logs.level": {"fr": "Niveau", "en": "Level"},
        "logs.timestamp": {"fr": "Horodatage", "en": "Timestamp"},
        "logs.message": {"fr": "Message", "en": "Message"},
        "logs.details": {"fr": "Détails", "en": "Details"},
        "logs.export": {"fr": "Exporter", "en": "Export"},
        "logs.clear": {"fr": "Effacer", "en": "Clear"},
        "logs.refresh": {"fr": "Actualiser", "en": "Refresh"},

        # Levels
        "logs.level.all": {"fr": "Tous", "en": "All"},
        "logs.level.debug": {"fr": "Debug", "en": "Debug"},
        "logs.level.info": {"fr": "Info", "en": "Info"},
        "logs.level.warning": {"fr": "Avertissement", "en": "Warning"},
        "logs.level.error": {"fr": "Erreur", "en": "Error"},
        "logs.level.critical": {"fr": "Critique", "en": "Critical"},

        # Messages de succès
        "message.api_key_created": {"fr": "Clé API créée avec succès", "en": "API key created successfully"},
        "message.api_key_revoked": {"fr": "Clé API révoquée", "en": "API key revoked"},
        "message.api_key_regenerated": {"fr": "Clé API régénérée", "en": "API key regenerated"},
        "message.webhook_created": {"fr": "Webhook créé avec succès", "en": "Webhook created successfully"},
        "message.webhook_updated": {"fr": "Webhook mis à jour", "en": "Webhook updated"},
        "message.webhook_deleted": {"fr": "Webhook supprimé", "en": "Webhook deleted"},
        "message.webhook_tested": {"fr": "Webhook testé avec succès", "en": "Webhook tested successfully"},
        "message.hook_created": {"fr": "Hook créé avec succès", "en": "Hook created successfully"},
        "message.hook_updated": {"fr": "Hook mis à jour", "en": "Hook updated"},
        "message.hook_deleted": {"fr": "Hook supprimé", "en": "Hook deleted"},
        "message.hook_triggered": {"fr": "Hook déclenché avec succès", "en": "Hook triggered successfully"},
        "message.copied": {"fr": "Copié dans le presse-papiers", "en": "Copied to clipboard"},
        "message.logs_exported": {"fr": "Logs exportés avec succès", "en": "Logs exported successfully"},

        # Messages d'erreur
        "error.load_failed": {"fr": "Impossible de charger les données", "en": "Failed to load data"},
        "error.create_failed": {"fr": "Impossible de créer", "en": "Failed to create"},
        "error.update_failed": {"fr": "Impossible de mettre à jour", "en": "Failed to update"},
        "error.delete_failed": {"fr": "Impossible de supprimer", "en": "Failed to delete"},
        "error.test_failed": {"fr": "Échec du test", "en": "Test failed"},
        "error.copy_failed": {"fr": "Impossible de copier", "en": "Failed to copy"},

        # Table
        "table.no_results": {"fr": "Aucun résultat trouvé", "en": "No results found"},
        "table.loading": {"fr": "Chargement...", "en": "Loading..."},
        "table.no_logs": {"fr": "Aucun log trouvé", "en": "No logs found"},
    },

    "core.dashboard": {
        # Page principale
        "title": {"fr": "Tableau de bord", "en": "Dashboard"},
        "welcome": {"fr": "Bienvenue", "en": "Welcome"},
        "overview": {"fr": "Vue d'ensemble", "en": "Overview"},
        "page.description": {"fr": "Vue d'ensemble de l'activité", "en": "Activity overview"},

        # Breadcrumb
        "breadcrumb.home": {"fr": "Accueil", "en": "Home"},
        "breadcrumb.dashboard": {"fr": "Tableau de bord", "en": "Dashboard"},

        # Widgets
        "widgets.users": {"fr": "Utilisateurs", "en": "Users"},
        "widgets.groups": {"fr": "Groupes", "en": "Groups"},
        "widgets.tasks": {"fr": "Tâches", "en": "Tasks"},
        "widgets.recent_activity": {"fr": "Activité récente", "en": "Recent activity"},
        "widgets.quick_actions": {"fr": "Actions rapides", "en": "Quick actions"},
        "widgets.stats": {"fr": "Statistiques", "en": "Statistics"},
        "widgets.performance": {"fr": "Performance", "en": "Performance"},
        "widgets.notifications": {"fr": "Notifications", "en": "Notifications"},

        # Actions
        "action.refresh": {"fr": "Actualiser", "en": "Refresh"},
        "action.customize": {"fr": "Personnaliser", "en": "Customize"},
        "action.view_all": {"fr": "Voir tout", "en": "View all"},
        "action.export": {"fr": "Exporter", "en": "Export"},

        # Stats
        "stats.total_users": {"fr": "Total utilisateurs", "en": "Total users"},
        "stats.active_users": {"fr": "Utilisateurs actifs", "en": "Active users"},
        "stats.pending_tasks": {"fr": "Tâches en attente", "en": "Pending tasks"},
        "stats.recent_logins": {"fr": "Connexions récentes", "en": "Recent logins"},
        "stats.new_this_week": {"fr": "Nouveaux cette semaine", "en": "New this week"},
        "stats.growth": {"fr": "Croissance", "en": "Growth"},

        # Messages
        "message.loading": {"fr": "Chargement du tableau de bord...", "en": "Loading dashboard..."},
        "message.no_data": {"fr": "Aucune donnée disponible", "en": "No data available"},
        "message.error": {"fr": "Erreur lors du chargement", "en": "Error loading"},
        "message.refreshed": {"fr": "Tableau de bord actualisé", "en": "Dashboard refreshed"},
    },

    "core.tasks": {
        # Page principale
        "page.title": {"fr": "Tâches", "en": "Tasks"},
        "page.description": {"fr": "Gestion des tâches", "en": "Task management"},

        # Breadcrumb
        "breadcrumb.home": {"fr": "Accueil", "en": "Home"},
        "breadcrumb.tasks": {"fr": "Tâches", "en": "Tasks"},

        # Actions
        "action.create": {"fr": "Créer une tâche", "en": "Create task"},
        "action.edit": {"fr": "Modifier", "en": "Edit"},
        "action.delete": {"fr": "Supprimer", "en": "Delete"},
        "action.assign": {"fr": "Assigner", "en": "Assign"},
        "action.complete": {"fr": "Terminer", "en": "Complete"},
        "action.archive": {"fr": "Archiver", "en": "Archive"},
        "action.view_details": {"fr": "Voir les détails", "en": "View details"},

        # Champs
        "field.title": {"fr": "Titre", "en": "Title"},
        "field.description": {"fr": "Description", "en": "Description"},
        "field.status": {"fr": "Statut", "en": "Status"},
        "field.priority": {"fr": "Priorité", "en": "Priority"},
        "field.assignee": {"fr": "Assigné à", "en": "Assigned to"},
        "field.due_date": {"fr": "Date d'échéance", "en": "Due date"},
        "field.created_at": {"fr": "Créé le", "en": "Created at"},
        "field.updated_at": {"fr": "Modifié le", "en": "Updated at"},
        "field.completed_at": {"fr": "Terminé le", "en": "Completed at"},

        # Stats
        "stats.total": {"fr": "Total tâches", "en": "Total tasks"},
        "stats.total_desc": {"fr": "Nombre total de tâches", "en": "Total number of tasks"},
        "stats.pending": {"fr": "En attente", "en": "Pending"},
        "stats.pending_desc": {"fr": "Tâches à faire", "en": "Tasks to do"},
        "stats.in_progress": {"fr": "En cours", "en": "In progress"},
        "stats.in_progress_desc": {"fr": "Tâches en cours de traitement", "en": "Tasks in progress"},
        "stats.completed": {"fr": "Terminées", "en": "Completed"},
        "stats.completed_desc": {"fr": "Tâches terminées", "en": "Completed tasks"},
        "stats.overdue": {"fr": "En retard", "en": "Overdue"},
        "stats.overdue_desc": {"fr": "Tâches en retard", "en": "Overdue tasks"},

        # Table
        "table.no_results": {"fr": "Aucune tâche trouvée", "en": "No tasks found"},
        "table.loading": {"fr": "Chargement...", "en": "Loading..."},
        "table.columns": {"fr": "Colonnes", "en": "Columns"},

        # Filtres
        "filter.search": {"fr": "Rechercher une tâche...", "en": "Search task..."},
        "filter.by_status": {"fr": "Par statut", "en": "By status"},
        "filter.by_priority": {"fr": "Par priorité", "en": "By priority"},
        "filter.by_assignee": {"fr": "Par assigné", "en": "By assignee"},
        "filter.reset": {"fr": "Réinitialiser", "en": "Reset"},
        "filter.all": {"fr": "Toutes", "en": "All"},

        # Status
        "status.pending": {"fr": "En attente", "en": "Pending"},
        "status.todo": {"fr": "À faire", "en": "To do"},
        "status.in_progress": {"fr": "En cours", "en": "In progress"},
        "status.completed": {"fr": "Terminée", "en": "Completed"},
        "status.done": {"fr": "Terminé", "en": "Done"},
        "status.cancelled": {"fr": "Annulée", "en": "Cancelled"},

        # Priority
        "priority.low": {"fr": "Basse", "en": "Low"},
        "priority.medium": {"fr": "Moyenne", "en": "Medium"},
        "priority.high": {"fr": "Haute", "en": "High"},
        "priority.urgent": {"fr": "Urgente", "en": "Urgent"},

        # Messages de succès
        "message.created": {"fr": "Tâche créée avec succès", "en": "Task created successfully"},
        "message.updated": {"fr": "Tâche mise à jour", "en": "Task updated"},
        "message.deleted": {"fr": "Tâche supprimée", "en": "Task deleted"},
        "message.completed": {"fr": "Tâche terminée", "en": "Task completed"},
        "message.assigned": {"fr": "Tâche assignée avec succès", "en": "Task assigned successfully"},
        "message.archived": {"fr": "Tâche archivée", "en": "Task archived"},

        # Messages d'erreur
        "error.load_failed": {"fr": "Impossible de charger les tâches", "en": "Failed to load tasks"},
        "error.create_failed": {"fr": "Impossible de créer la tâche", "en": "Failed to create task"},
        "error.update_failed": {"fr": "Impossible de mettre à jour la tâche", "en": "Failed to update task"},
        "error.delete_failed": {"fr": "Impossible de supprimer la tâche", "en": "Failed to delete task"},
        "error.assign_failed": {"fr": "Impossible d'assigner la tâche", "en": "Failed to assign task"},

        # Dialog - Créer
        "dialog.create.title": {"fr": "Créer une tâche", "en": "Create task"},
        "dialog.create.description": {"fr": "Ajouter une nouvelle tâche", "en": "Add a new task"},

        # Dialog - Modifier
        "dialog.edit.title": {"fr": "Modifier la tâche", "en": "Edit task"},
        "dialog.edit.description": {"fr": "Modifier les informations de la tâche", "en": "Edit task information"},

        # Dialog - Supprimer
        "dialog.delete.title": {"fr": "Supprimer la tâche", "en": "Delete task"},
        "dialog.delete.description": {"fr": "Êtes-vous sûr de vouloir supprimer cette tâche ? Cette action est irréversible.", "en": "Are you sure you want to delete this task? This action cannot be undone."},
        "dialog.delete.confirm": {"fr": "Oui, supprimer", "en": "Yes, delete"},
        "dialog.delete.cancel": {"fr": "Annuler", "en": "Cancel"},
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
