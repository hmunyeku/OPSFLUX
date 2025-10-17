"""
Script pour insérer des traductions de test pour le namespace core.common
"""

import asyncio
from sqlmodel import Session, select
from app.core.db import engine
from app.models_i18n import Language, TranslationNamespace, Translation


async def seed_translations():
    """Crée des traductions de test en FR et EN"""

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

        # Récupérer le namespace core.common
        namespace = session.exec(
            select(TranslationNamespace).where(
                TranslationNamespace.code == "core.common"
            )
        ).first()

        if not namespace:
            print("❌ Namespace 'core.common' non trouvé. Veuillez d'abord exécuter les migrations.")
            return

        print(f"✅ Namespace trouvé: {namespace.code}")
        print(f"✅ Langues trouvées: FR ({fr_lang.id}), EN ({en_lang.id})")

        # Traductions à créer
        translations_data = {
            # Header / Navigation
            "header.language": {
                "fr": "Langue",
                "en": "Language"
            },
            "header.search": {
                "fr": "Rechercher...",
                "en": "Search..."
            },
            "header.notifications": {
                "fr": "Notifications",
                "en": "Notifications"
            },
            "header.profile": {
                "fr": "Profil",
                "en": "Profile"
            },
            "header.settings": {
                "fr": "Paramètres",
                "en": "Settings"
            },
            "header.logout": {
                "fr": "Se déconnecter",
                "en": "Log out"
            },

            # Common actions
            "common.save": {
                "fr": "Enregistrer",
                "en": "Save"
            },
            "common.cancel": {
                "fr": "Annuler",
                "en": "Cancel"
            },
            "common.delete": {
                "fr": "Supprimer",
                "en": "Delete"
            },
            "common.edit": {
                "fr": "Modifier",
                "en": "Edit"
            },
            "common.create": {
                "fr": "Créer",
                "en": "Create"
            },
            "common.loading": {
                "fr": "Chargement...",
                "en": "Loading..."
            },

            # Messages
            "message.success": {
                "fr": "Opération réussie",
                "en": "Operation successful"
            },
            "message.error": {
                "fr": "Une erreur est survenue",
                "en": "An error occurred"
            }
        }

        created_count = 0
        skipped_count = 0

        for key, values in translations_data.items():
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

        print(f"\n✅ Traductions créées: {created_count}")
        print(f"⏭️  Traductions ignorées (déjà existantes): {skipped_count}")
        print(f"📊 Total de clés: {len(translations_data)}")


if __name__ == "__main__":
    asyncio.run(seed_translations())
