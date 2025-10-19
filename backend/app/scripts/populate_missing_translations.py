"""
Script pour générer et insérer toutes les traductions manquantes détectées dans le frontend.

Ce script :
1. Lit le fichier missing_translations.json généré par l'analyse du frontend
2. Extrait toutes les clés uniques
3. Génère automatiquement des traductions EN et FR basées sur les clés
4. Insère ces traductions dans la base de données

Usage:
    uv run python app/scripts/populate_missing_translations.py
"""

import json
import re
from pathlib import Path
from uuid import UUID
from sqlmodel import Session, select
from app.core.db import engine
from app.models_i18n import Language, TranslationNamespace, Translation


def key_to_text(key: str, language: str = "fr") -> str:
    """
    Convertit une clé de traduction en texte lisible.

    Exemples:
        validation.email_required -> "L'email est requis" (FR) / "Email is required" (EN)
        login.email -> "Email" (FR/EN)
        fields.first_name.label -> "Prénom" (FR) / "First name" (EN)
    """
    # Supprimer les préfixes courants
    key_clean = key.replace("validation.", "").replace("fields.", "").replace("actions.", "")
    key_clean = key_clean.replace("toast.", "").replace("create_dialog.", "").replace("sections.", "")

    # Extraire la dernière partie significative
    parts = key_clean.split(".")
    last_part = parts[-1]

    # Convertir snake_case ou camelCase en mots
    words = re.sub(r'([a-z])([A-Z])', r'\1 \2', last_part)  # camelCase
    words = words.replace("_", " ")  # snake_case

    if language == "fr":
        # Dictionnaire FR pour les traductions courantes
        translations_fr = {
            # Validation
            "email required": "L'email est requis",
            "email invalid": "Adresse email invalide",
            "password required": "Le mot de passe est requis",
            "password min length": "Le mot de passe doit contenir au moins 8 caractères",
            "password lowercase": "Le mot de passe doit contenir au moins une minuscule",
            "password uppercase": "Le mot de passe doit contenir au moins une majuscule",
            "password number": "Le mot de passe doit contenir au moins un chiffre",
            "password special": "Le mot de passe doit contenir au moins un caractère spécial",
            "passwords dont match": "Les mots de passe ne correspondent pas",
            "first name required": "Le prénom est requis",
            "last name required": "Le nom est requis",
            "phone required": "Le numéro de téléphone est requis",
            "role required": "Le rôle est requis",

            # Champs
            "label": "Libellé",
            "placeholder": "Placeholder",
            "helper": "Aide",
            "email": "Email",
            "password": "Mot de passe",
            "first name": "Prénom",
            "last name": "Nom",
            "phone number": "Numéro de téléphone",
            "role": "Rôle",
            "confirm password": "Confirmer le mot de passe",

            # Actions
            "save": "Enregistrer",
            "cancel": "Annuler",
            "delete": "Supprimer",
            "edit": "Modifier",
            "create": "Créer",
            "update": "Mettre à jour",
            "add": "Ajouter",
            "remove": "Retirer",
            "search": "Rechercher",
            "filter": "Filtrer",
            "export": "Exporter",
            "import": "Importer",
            "saving": "Enregistrement...",
            "loading": "Chargement...",
            "adding": "Ajout...",
            "updating": "Mise à jour...",
            "deleting": "Suppression...",

            # Messages
            "success": "Succès",
            "error": "Erreur",
            "warning": "Attention",
            "info": "Information",

            # Pages
            "title": "Titre",
            "subtitle": "Sous-titre",
            "description": "Description",
            "breadcrumb": "Fil d'Ariane",
            "home": "Accueil",
            "users": "Utilisateurs",
            "settings": "Paramètres",
            "profile": "Profil",
            "dashboard": "Tableau de bord",
            "developers": "Développeurs",

            # Sections
            "personal info": "Informations personnelles",
            "account": "Compte",
            "address": "Adresse",
            "preferences": "Préférences",

            # Autres
            "requirements": "Exigences",
            "min length": "Longueur minimale",
            "lowercase": "Minuscule",
            "uppercase": "Majuscule",
            "number": "Chiffre",
            "special": "Caractère spécial",
        }

        words_lower = words.lower()
        if words_lower in translations_fr:
            return translations_fr[words_lower]

        # Capitaliser la première lettre par défaut
        return words.capitalize()

    else:  # EN
        # Dictionnaire EN pour les traductions courantes
        translations_en = {
            # Validation
            "email required": "Email is required",
            "email invalid": "Invalid email address",
            "password required": "Password is required",
            "password min length": "Password must be at least 8 characters",
            "password lowercase": "Password must contain at least one lowercase letter",
            "password uppercase": "Password must contain at least one uppercase letter",
            "password number": "Password must contain at least one number",
            "password special": "Password must contain at least one special character",
            "passwords dont match": "Passwords don't match",
            "first name required": "First name is required",
            "last name required": "Last name is required",
            "phone required": "Phone number is required",
            "role required": "Role is required",

            # Champs
            "label": "Label",
            "placeholder": "Placeholder",
            "helper": "Helper text",
            "email": "Email",
            "password": "Password",
            "first name": "First name",
            "last name": "Last name",
            "phone number": "Phone number",
            "role": "Role",
            "confirm password": "Confirm password",

            # Actions
            "save": "Save",
            "cancel": "Cancel",
            "delete": "Delete",
            "edit": "Edit",
            "create": "Create",
            "update": "Update",
            "add": "Add",
            "remove": "Remove",
            "search": "Search",
            "filter": "Filter",
            "export": "Export",
            "import": "Import",
            "saving": "Saving...",
            "loading": "Loading...",
            "adding": "Adding...",
            "updating": "Updating...",
            "deleting": "Deleting...",

            # Messages
            "success": "Success",
            "error": "Error",
            "warning": "Warning",
            "info": "Information",

            # Pages
            "title": "Title",
            "subtitle": "Subtitle",
            "description": "Description",
            "breadcrumb": "Breadcrumb",
            "home": "Home",
            "users": "Users",
            "settings": "Settings",
            "profile": "Profile",
            "dashboard": "Dashboard",
            "developers": "Developers",

            # Sections
            "personal info": "Personal Information",
            "account": "Account",
            "address": "Address",
            "preferences": "Preferences",

            # Autres
            "requirements": "Requirements",
            "min length": "Minimum length",
            "lowercase": "Lowercase",
            "uppercase": "Uppercase",
            "number": "Number",
            "special": "Special character",
        }

        words_lower = words.lower()
        if words_lower in translations_en:
            return translations_en[words_lower]

        # Capitaliser chaque mot par défaut
        return words.title()


def extract_unique_keys_with_namespace(json_file_path: str) -> dict[str, set[str]]:
    """
    Extrait toutes les clés uniques du fichier JSON avec leur namespace détecté.

    Retourne un dictionnaire {namespace: set(keys)}
    """
    with open(json_file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    namespace_keys = {}

    for file_info in data.get("files", []):
        relative_path = file_info["relative_path"]

        # Déterminer le namespace basé sur le chemin
        if "(auth)" in relative_path:
            namespace = "core.auth"
        elif "users" in relative_path:
            namespace = "core.users"
        elif "settings" in relative_path:
            namespace = "core.settings"
        elif "developers" in relative_path:
            namespace = "core.developers"
        elif "tasks" in relative_path:
            namespace = "core.tasks"
        elif "dashboard" in relative_path:
            namespace = "core.dashboard"
        else:
            namespace = "core.common"

        if namespace not in namespace_keys:
            namespace_keys[namespace] = set()

        for key_info in file_info["missing_keys"]:
            key = key_info["key"]
            # Ignorer les clés invalides
            if key not in ["token", " ", ",", "a", "sidebar_state"]:
                namespace_keys[namespace].add(key)

    return namespace_keys


def main():
    """Point d'entrée principal du script."""
    print("🚀 Démarrage du script de population des traductions manquantes...")

    # Chemin du fichier JSON
    json_file = Path("/app/frontend_missing_translations.json")

    if not json_file.exists():
        print(f"❌ Fichier {json_file} introuvable")
        return

    print(f"📂 Lecture du fichier: {json_file}")

    # Extraire les clés par namespace
    namespace_keys = extract_unique_keys_with_namespace(str(json_file))

    total_keys = sum(len(keys) for keys in namespace_keys.values())
    print(f"✅ {total_keys} clés uniques trouvées dans {len(namespace_keys)} namespaces")

    with Session(engine) as session:
        # Récupérer les langues FR et EN
        lang_fr = session.exec(select(Language).where(Language.code == "fr")).first()
        lang_en = session.exec(select(Language).where(Language.code == "en")).first()

        if not lang_fr or not lang_en:
            print("❌ Langues FR ou EN non trouvées dans la base de données")
            print("💡 Exécutez d'abord le script de population des langues")
            return

        print(f"✅ Langues trouvées: FR ({lang_fr.id}), EN ({lang_en.id})")

        # Traiter chaque namespace
        for namespace_code, keys in namespace_keys.items():
            print(f"\n📦 Traitement du namespace: {namespace_code} ({len(keys)} clés)")

            # Récupérer ou créer le namespace
            namespace = session.exec(
                select(TranslationNamespace).where(TranslationNamespace.code == namespace_code)
            ).first()

            if not namespace:
                # Créer le namespace
                namespace = TranslationNamespace(
                    code=namespace_code,
                    name=namespace_code.replace("core.", "Core - ").replace("_", " ").title(),
                    namespace_type="core"
                )
                session.add(namespace)
                session.commit()
                session.refresh(namespace)
                print(f"   ✨ Namespace créé: {namespace_code}")

            # Insérer les traductions
            translations_added = 0
            translations_skipped = 0

            for key in sorted(keys):
                # Vérifier si la traduction existe déjà (FR)
                existing_fr = session.exec(
                    select(Translation).where(
                        Translation.namespace_id == namespace.id,
                        Translation.language_id == lang_fr.id,
                        Translation.key == key
                    )
                ).first()

                if not existing_fr:
                    # Créer traduction FR
                    trans_fr = Translation(
                        namespace_id=namespace.id,
                        language_id=lang_fr.id,
                        key=key,
                        value=key_to_text(key, "fr"),
                        context=f"Auto-généré depuis l'analyse du frontend"
                    )
                    session.add(trans_fr)
                    translations_added += 1
                else:
                    translations_skipped += 1

                # Vérifier si la traduction existe déjà (EN)
                existing_en = session.exec(
                    select(Translation).where(
                        Translation.namespace_id == namespace.id,
                        Translation.language_id == lang_en.id,
                        Translation.key == key
                    )
                ).first()

                if not existing_en:
                    # Créer traduction EN
                    trans_en = Translation(
                        namespace_id=namespace.id,
                        language_id=lang_en.id,
                        key=key,
                        value=key_to_text(key, "en"),
                        context=f"Auto-generated from frontend analysis"
                    )
                    session.add(trans_en)
                    translations_added += 1
                else:
                    translations_skipped += 1

            session.commit()
            print(f"   ✅ {translations_added} traductions ajoutées, {translations_skipped} ignorées (déjà existantes)")

        print(f"\n🎉 Traitement terminé ! Toutes les traductions ont été insérées.")


if __name__ == "__main__":
    main()
