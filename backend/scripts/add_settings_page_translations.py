#!/usr/bin/env python3
"""
Script pour ajouter les traductions des pages de paramètres
Exécute les traductions pour toutes les pages dans /settings
"""
import sys
from pathlib import Path

# Ajouter le répertoire parent au PYTHONPATH
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlmodel import Session, select
from app.core.db import engine
from app.models_i18n import Translation, TranslationNamespace, Language
import uuid


def add_translation(session: Session, namespace_code: str, language_code: str, key: str, value: str):
    """Ajoute ou met à jour une traduction"""

    # Récupérer le namespace
    namespace = session.exec(
        select(TranslationNamespace).where(TranslationNamespace.code == namespace_code)
    ).first()

    if not namespace:
        print(f"❌ Namespace {namespace_code} not found")
        return False

    # Récupérer la langue
    language = session.exec(
        select(Language).where(Language.code == language_code)
    ).first()

    if not language:
        print(f"❌ Language {language_code} not found")
        return False

    # Vérifier si la traduction existe déjà
    existing = session.exec(
        select(Translation).where(
            Translation.namespace_id == namespace.id,
            Translation.language_id == language.id,
            Translation.key == key
        )
    ).first()

    if existing:
        existing.value = value
        existing.is_verified = True
        session.add(existing)
        print(f"✅ Updated: {key} ({language_code})")
    else:
        translation = Translation(
            id=uuid.uuid4(),
            namespace_id=namespace.id,
            language_id=language.id,
            key=key,
            value=value,
            is_verified=True
        )
        session.add(translation)
        print(f"✅ Created: {key} ({language_code})")

    return True


def main():
    """Fonction principale"""

    # Traductions à ajouter
    translations = {
        "general": {
            "fr": {"title": "Paramètres généraux", "description": "Gérez les paramètres généraux de votre application"},
            "en": {"title": "General Settings", "description": "Manage your application general settings"}
        },
        "connected_apps": {
            "fr": {"title": "Applications connectées", "description": "Gérez les applications tierces connectées à votre compte"},
            "en": {"title": "Connected Apps", "description": "Manage third-party applications connected to your account"}
        },
        "metrics": {
            "fr": {"title": "Métriques", "description": "Consultez les métriques et statistiques de votre application"},
            "en": {"title": "Metrics", "description": "View your application metrics and statistics"}
        },
        "cache": {
            "fr": {"title": "Cache", "description": "Gérez le cache de l'application pour optimiser les performances"},
            "en": {"title": "Cache", "description": "Manage application cache to optimize performance"}
        },
        "storage": {
            "fr": {"title": "Stockage", "description": "Gérez le stockage des fichiers et des médias"},
            "en": {"title": "Storage", "description": "Manage file and media storage"}
        },
        "queue": {
            "fr": {"title": "Files d'attente", "description": "Surveillez et gérez les tâches en arrière-plan"},
            "en": {"title": "Queue", "description": "Monitor and manage background tasks"}
        },
        "search": {
            "fr": {"title": "Recherche", "description": "Configurez les paramètres de recherche et d'indexation"},
            "en": {"title": "Search", "description": "Configure search and indexing settings"}
        },
        "database": {
            "fr": {"title": "Base de données", "description": "Gérez et surveillez votre base de données"},
            "en": {"title": "Database", "description": "Manage and monitor your database"}
        }
    }

    with Session(engine) as session:
        print("🚀 Ajout des traductions des pages de paramètres...")
        print()

        for page, langs in translations.items():
            print(f"📄 Page: {page}")
            for lang_code, texts in langs.items():
                for key_type, text in texts.items():
                    key = f"{page}.{key_type}"
                    add_translation(session, "core.settings", lang_code, key, text)
            print()

        session.commit()
        print("✅ Toutes les traductions ont été ajoutées avec succès!")


if __name__ == "__main__":
    main()
