"""
Script pour ajouter les traductions manquantes pour la page 403 (Forbidden)
"""
import os
import sys
import uuid
from pathlib import Path

# Ajouter le répertoire parent au path pour importer les modules de l'app
sys.path.insert(0, str(Path(__file__).parent.parent))

# Set environment variables to avoid issues
os.environ.setdefault("ENVIRONMENT", "production")

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from app.core.config import settings

# Create engine directly
engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))


def add_forbidden_translations():
    """Ajoute les traductions pour la page 403"""

    with Session(engine) as session:
        # Récupérer le namespace core.errors
        namespace_result = session.execute(
            text("SELECT id, code FROM translation_namespace WHERE code = 'core.errors'")
        ).fetchone()

        if not namespace_result:
            print("❌ Namespace 'core.errors' introuvable")
            return

        namespace_id, namespace_code = namespace_result
        print(f"✅ Namespace trouvé: {namespace_code} (ID: {namespace_id})")

        # Récupérer les langues
        languages_result = session.execute(
            text("SELECT id, code FROM language WHERE code IN ('fr', 'en')")
        ).fetchall()

        if not languages_result:
            print("❌ Aucune langue trouvée")
            return

        languages = {code: lang_id for lang_id, code in languages_result}
        print(f"✅ Langues trouvées: {', '.join(languages.keys())}")

        # Définir les traductions
        translations_data = {
            "forbidden.title": {
                "fr": "Accès refusé",
                "en": "Access Denied"
            },
            "forbidden.description": {
                "fr": "Vous n'avez pas les permissions nécessaires pour accéder à cette ressource.",
                "en": "You don't have the necessary permissions to access this resource."
            },
            "forbidden.why_title": {
                "fr": "Pourquoi voyez-vous cette page ?",
                "en": "Why are you seeing this page?"
            },
            "forbidden.reason_1": {
                "fr": "Votre rôle ne dispose pas des permissions requises",
                "en": "Your role doesn't have the required permissions"
            },
            "forbidden.reason_2": {
                "fr": "Votre compte n'a pas été activé pour cette fonctionnalité",
                "en": "Your account hasn't been activated for this feature"
            },
            "forbidden.reason_3": {
                "fr": "Cette ressource est réservée à certains utilisateurs",
                "en": "This resource is restricted to certain users"
            },
            "forbidden.contact_admin": {
                "fr": "Si vous pensez qu'il s'agit d'une erreur, veuillez contacter votre administrateur système.",
                "en": "If you believe this is an error, please contact your system administrator."
            }
        }

        # Ajouter les traductions
        added_count = 0
        updated_count = 0

        for key, translations in translations_data.items():
            for lang_code, value in translations.items():
                if lang_code not in languages:
                    continue

                lang_id = languages[lang_code]

                # Vérifier si la traduction existe déjà
                existing = session.execute(
                    text("""
                        SELECT id FROM translation
                        WHERE namespace_id = :namespace_id
                          AND language_id = :language_id
                          AND key = :key
                    """),
                    {"namespace_id": namespace_id, "language_id": lang_id, "key": key}
                ).fetchone()

                if existing:
                    # Mettre à jour
                    session.execute(
                        text("""
                            UPDATE translation
                            SET value = :value
                            WHERE id = :id
                        """),
                        {"id": existing[0], "value": value}
                    )
                    updated_count += 1
                    print(f"🔄 Mise à jour: {key} ({lang_code})")
                else:
                    # Créer
                    session.execute(
                        text("""
                            INSERT INTO translation (id, namespace_id, language_id, key, value)
                            VALUES (:id, :namespace_id, :language_id, :key, :value)
                        """),
                        {
                            "id": uuid.uuid4(),
                            "namespace_id": namespace_id,
                            "language_id": lang_id,
                            "key": key,
                            "value": value
                        }
                    )
                    added_count += 1
                    print(f"✅ Ajout: {key} ({lang_code})")

        session.commit()

        print(f"\n✅ Traductions ajoutées: {added_count}")
        print(f"🔄 Traductions mises à jour: {updated_count}")
        print(f"📝 Total: {added_count + updated_count}")


if __name__ == "__main__":
    add_forbidden_translations()
