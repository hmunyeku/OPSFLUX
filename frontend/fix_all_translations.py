#!/usr/bin/env python3
"""
Script pour ajouter automatiquement les valeurs par défaut en français
à toutes les clés de traduction manquantes dans les fichiers TypeScript.

Ce script :
1. Lit le fichier missing_translations.json
2. Pour chaque fichier, extrait les clés manquantes
3. Génère automatiquement des valeurs par défaut en français
4. Modifie les fichiers en place pour ajouter les valeurs par défaut

Usage:
    python3 fix_all_translations.py
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Tuple


def key_to_french(key: str) -> str:
    """
    Convertit une clé de traduction en texte français.

    Exemples:
        validation.email_required -> "L'email est requis"
        login.email -> "Email"
        fields.first_name.label -> "Prénom"
    """
    # Dictionnaire de traductions courantes
    translations = {
        # Validation
        "validation.email_required": "L'email est requis",
        "validation.email_invalid": "Adresse email invalide",
        "validation.password_required": "Le mot de passe est requis",
        "validation.password_min_length": "Le mot de passe doit contenir au moins 8 caractères",
        "validation.password_lowercase": "Le mot de passe doit contenir au moins une minuscule",
        "validation.password_uppercase": "Le mot de passe doit contenir au moins une majuscule",
        "validation.password_number": "Le mot de passe doit contenir au moins un chiffre",
        "validation.password_special": "Le mot de passe doit contenir au moins un caractère spécial",
        "validation.passwords_dont_match": "Les mots de passe ne correspondent pas",
        "validation.first_name_required": "Le prénom est requis",
        "validation.last_name_required": "Le nom est requis",
        "validation.phone_required": "Le numéro de téléphone est requis",
        "validation.role_required": "Le rôle est requis",
        "validation.name_required": "Le nom est requis",
        "validation.description_required": "La description est requise",

        # Champs - Labels
        "fields.first_name.label": "Prénom",
        "fields.last_name.label": "Nom",
        "fields.email.label": "Email",
        "fields.password.label": "Mot de passe",
        "fields.confirm_password.label": "Confirmer le mot de passe",
        "fields.phone_number.label": "Numéro de téléphone",
        "fields.role.label": "Rôle",
        "fields.name.label": "Nom",
        "fields.description.label": "Description",
        "fields.status.label": "Statut",
        "fields.type.label": "Type",

        # Champs - Placeholders
        "fields.first_name.placeholder": "Jean",
        "fields.last_name.placeholder": "Dupont",
        "fields.email.placeholder": "jean.dupont@example.com",
        "fields.password.placeholder": "Entrez un mot de passe",
        "fields.confirm_password.placeholder": "Confirmez le mot de passe",
        "fields.phone_number.placeholder": "+33 6 12 34 56 78",
        "fields.role.placeholder": "Sélectionnez un rôle",

        # Champs - Helper
        "fields.email.helper": "L'utilisateur recevra des notifications à cette adresse",
        "fields.confirm_password.helper": "Entrez d'abord un mot de passe",
        "fields.password.requirements": "Le mot de passe doit contenir :",
        "fields.password.min_length": "Au moins 8 caractères",
        "fields.password.lowercase": "Une lettre minuscule",
        "fields.password.uppercase": "Une lettre majuscule",
        "fields.password.number": "Un chiffre",
        "fields.password.special": "Un caractère spécial",

        # Login
        "login.email": "Email",
        "login.email_placeholder": "Entrez votre email",
        "login.password": "Mot de passe",
        "login.password_placeholder": "Entrez votre mot de passe",
        "login.forgot_password": "Mot de passe oublié ?",
        "login.button": "Se connecter",
        "login.button_loading": "Connexion...",
        "login.subtitle": "Connectez-vous à votre compte",
        "login.terms_text": "En continuant, vous acceptez nos",
        "login.terms_link": "Conditions d'utilisation",
        "login.terms_and": "et notre",
        "login.privacy_link": "Politique de confidentialité",

        # Actions
        "actions.save": "Enregistrer",
        "actions.cancel": "Annuler",
        "actions.delete": "Supprimer",
        "actions.edit": "Modifier",
        "actions.create": "Créer",
        "actions.update": "Mettre à jour",
        "actions.add": "Ajouter",
        "actions.remove": "Retirer",
        "actions.search": "Rechercher",
        "actions.filter": "Filtrer",
        "actions.export": "Exporter",
        "actions.import": "Importer",
        "actions.saving": "Enregistrement...",
        "actions.loading": "Chargement...",
        "actions.adding": "Ajout...",
        "actions.updating": "Mise à jour...",
        "actions.deleting": "Suppression...",

        # Dialog
        "create_dialog.title_create": "Créer un utilisateur",
        "create_dialog.title_edit": "Modifier l'utilisateur",
        "create_dialog.description_create": "Créez un nouvel utilisateur en remplissant les informations ci-dessous",
        "create_dialog.description_edit": "Modifiez les informations de l'utilisateur",
        "create_dialog.cancel": "Annuler",
        "create_dialog.save_changes": "Enregistrer",
        "create_dialog.saving": "Enregistrement...",

        # Sections
        "sections.personal_info": "Informations personnelles",
        "sections.account": "Détails du compte",
        "sections.address": "Adresse (Optionnel)",
        "sections.preferences": "Préférences",

        # Toast
        "toast.success": "Succès",
        "toast.error": "Erreur",
        "toast.error_title": "Erreur",
        "toast.error_load_roles": "Impossible de charger les rôles",
        "toast.error_save_user": "Impossible d'enregistrer l'utilisateur",
        "toast.user_created_title": "Utilisateur créé",
        "toast.user_created_description": "L'utilisateur a été créé avec succès",
        "toast.user_updated_title": "Utilisateur mis à jour",
        "toast.user_updated_description": "L'utilisateur a été mis à jour avec succès",

        # Breadcrumb
        "breadcrumb.home": "Accueil",
        "breadcrumb.users": "Utilisateurs",
        "breadcrumb.settings": "Paramètres",
        "breadcrumb.developers": "Développeurs",
        "breadcrumb.rbac": "RBAC",
        "breadcrumb.tasks": "Tâches",

        # Pages
        "page.title": "Titre",
        "page.description": "Description",

        # Messages
        "message.success": "Succès",
        "message.error": "Erreur",
        "message.login_success": "Connexion réussie",
        "message.login_error": "Erreur de connexion",
        "message.2fa_error": "Erreur 2FA",
    }

    # Si la clé existe dans le dictionnaire, la retourner
    if key in translations:
        return translations[key]

    # Sinon, générer une traduction basique
    # Extraire la dernière partie de la clé
    parts = key.split(".")
    last_part = parts[-1]

    # Convertir snake_case en mots
    words = last_part.replace("_", " ")

    # Capitaliser
    return words.capitalize()


def fix_file(file_path: str, missing_keys: List[Dict]) -> Tuple[int, int]:
    """
    Corrige un fichier en ajoutant les valeurs par défaut aux clés manquantes.

    Retourne (nombre de corrections, nombre d'échecs)
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    corrections = 0
    failures = 0

    for key_info in missing_keys:
        key = key_info["key"]

        # Ignorer les clés invalides
        if key in ["token", " ", ",", "a", "sidebar_state"]:
            failures += 1
            continue

        # Générer la valeur par défaut
        default_value = key_to_french(key)

        # Pattern pour trouver t("key") sans valeur par défaut
        # Chercher t("key") ou t('key') qui n'a pas déjà un deuxième paramètre
        patterns = [
            (rf't\("{re.escape(key)}"\)(?!\s*,)', f't("{key}", "{default_value}")'),
            (rf"t\('{re.escape(key)}'\)(?!\s*,)", f"t('{key}', \"{default_value}\")"),
        ]

        for pattern, replacement in patterns:
            if re.search(pattern, content):
                content = re.sub(pattern, replacement, content)
                corrections += 1
                break
        else:
            failures += 1

    # Sauvegarder seulement si des modifications ont été faites
    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)

    return corrections, failures


def main():
    """Point d'entrée principal du script."""
    print("🚀 Démarrage de la correction automatique des traductions...")

    # Lire le fichier JSON
    json_file = Path(__file__).parent / "missing_translations.json"

    if not json_file.exists():
        print(f"❌ Fichier {json_file} introuvable")
        return

    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    total_corrections = 0
    total_failures = 0
    files_modified = 0

    print(f"📂 Traitement de {len(data['files'])} fichiers...")

    for file_info in data["files"]:
        file_path = file_info["file"]
        missing_keys = file_info["missing_keys"]

        if not missing_keys:
            continue

        print(f"\n📝 {file_info['relative_path']} ({len(missing_keys)} clés)")

        corrections, failures = fix_file(file_path, missing_keys)

        if corrections > 0:
            files_modified += 1
            total_corrections += corrections
            print(f"   ✅ {corrections} corrections, {failures} échecs")
        else:
            total_failures += failures
            print(f"   ⚠️  Aucune correction ({failures} échecs)")

    print(f"\n🎉 Traitement terminé !")
    print(f"   📊 {files_modified} fichiers modifiés")
    print(f"   ✅ {total_corrections} corrections appliquées")
    print(f"   ⚠️  {total_failures} clés ignorées")


if __name__ == "__main__":
    main()
