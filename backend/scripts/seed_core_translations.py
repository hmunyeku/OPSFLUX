"""
Script pour insérer les traductions CORE pour Queue et Storage
"""

import asyncio
from sqlmodel import Session, select
from app.core.db import engine
from app.models_i18n import Language, TranslationNamespace, Translation


async def seed_core_translations():
    """Crée les namespaces et traductions pour core.queue et core.storage"""

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

        # Créer ou récupérer les namespaces
        namespaces_to_create = [
            {
                "code": "core.queue",
                "name": "Core Queue",
                "description": "Traductions pour la gestion des tâches et queues Celery",
                "namespace_type": "core"
            },
            {
                "code": "core.storage",
                "name": "Core Storage",
                "description": "Traductions pour la gestion des fichiers et du stockage",
                "namespace_type": "core"
            },
            {
                "code": "core.cache",
                "name": "Core Cache",
                "description": "Traductions pour la gestion du cache",
                "namespace_type": "core"
            }
        ]

        namespaces = {}
        for ns_data in namespaces_to_create:
            existing_ns = session.exec(
                select(TranslationNamespace).where(
                    TranslationNamespace.code == ns_data["code"]
                )
            ).first()

            if not existing_ns:
                new_ns = TranslationNamespace(
                    code=ns_data["code"],
                    name=ns_data["name"],
                    description=ns_data["description"],
                    namespace_type=ns_data["namespace_type"]
                )
                session.add(new_ns)
                session.commit()
                session.refresh(new_ns)
                namespaces[ns_data["code"]] = new_ns
                print(f"✅ Namespace créé: {ns_data['code']}")
            else:
                namespaces[ns_data["code"]] = existing_ns
                print(f"✅ Namespace existant: {ns_data['code']}")

        # Traductions pour core.queue
        queue_translations = {
            "page.title": {
                "fr": "Gestion des Tâches",
                "en": "Task Management"
            },
            "page.description": {
                "fr": "Monitoring des workers Celery et des queues asynchrones",
                "en": "Monitoring Celery workers and asynchronous queues"
            },
            "toast.error.title": {
                "fr": "Erreur",
                "en": "Error"
            },
            "toast.error.load": {
                "fr": "Impossible de charger les statistiques des queues.",
                "en": "Failed to load queue statistics."
            }
        }

        # Traductions pour core.storage
        storage_translations = {
            "page.title": {
                "fr": "Gestion des Fichiers",
                "en": "File Management"
            },
            "page.description": {
                "fr": "Upload, gestion et stockage de fichiers",
                "en": "Upload, manage and store files"
            },
            "toast.error.title": {
                "fr": "Erreur",
                "en": "Error"
            },
            "toast.error.load": {
                "fr": "Impossible de charger les fichiers.",
                "en": "Failed to load files."
            },
            "toast.error.delete": {
                "fr": "Impossible de supprimer le fichier.",
                "en": "Failed to delete file."
            },
            "toast.upload.success": {
                "fr": "Fichier uploadé",
                "en": "File uploaded"
            },
            "toast.upload.success_description": {
                "fr": "{filename} a été uploadé avec succès.",
                "en": "{filename} was uploaded successfully."
            },
            "toast.upload.error": {
                "fr": "Erreur d'upload",
                "en": "Upload error"
            },
            "toast.delete.success": {
                "fr": "Fichier supprimé",
                "en": "File deleted"
            },
            "toast.delete.success_description": {
                "fr": "{filename} a été supprimé.",
                "en": "{filename} was deleted."
            },
            "actions.search": {
                "fr": "Rechercher un fichier...",
                "en": "Search for a file..."
            },
            "actions.category": {
                "fr": "Catégorie",
                "en": "Category"
            },
            "actions.category_all": {
                "fr": "Toutes",
                "en": "All"
            },
            "actions.category_documents": {
                "fr": "Documents",
                "en": "Documents"
            },
            "actions.category_images": {
                "fr": "Images",
                "en": "Images"
            },
            "actions.category_videos": {
                "fr": "Vidéos",
                "en": "Videos"
            },
            "actions.category_audio": {
                "fr": "Audio",
                "en": "Audio"
            },
            "actions.category_archives": {
                "fr": "Archives",
                "en": "Archives"
            },
            "actions.refresh": {
                "fr": "Actualiser",
                "en": "Refresh"
            },
            "actions.upload": {
                "fr": "Upload",
                "en": "Upload"
            },
            "stats.total_files": {
                "fr": "Total fichiers",
                "en": "Total files"
            },
            "stats.total_size": {
                "fr": "Taille totale",
                "en": "Total size"
            },
            "stats.categories": {
                "fr": "Catégories",
                "en": "Categories"
            },
            "files.title": {
                "fr": "Fichiers",
                "en": "Files"
            },
            "files.count": {
                "fr": "{count} fichier(s)",
                "en": "{count} file(s)"
            },
            "files.search_results": {
                "fr": "correspondant à \"{query}\"",
                "en": "matching \"{query}\""
            },
            "files.empty": {
                "fr": "Aucun fichier",
                "en": "No files"
            },
            "dialog.upload.title": {
                "fr": "Upload un fichier",
                "en": "Upload a file"
            },
            "dialog.upload.description": {
                "fr": "Sélectionnez un fichier à uploader sur le serveur",
                "en": "Select a file to upload to the server"
            },
            "dialog.upload.file_label": {
                "fr": "Fichier",
                "en": "File"
            },
            "dialog.upload.size_label": {
                "fr": "Taille",
                "en": "Size"
            },
            "dialog.upload.cancel": {
                "fr": "Annuler",
                "en": "Cancel"
            },
            "dialog.upload.confirm": {
                "fr": "Upload",
                "en": "Upload"
            },
            "dialog.upload.uploading": {
                "fr": "Upload...",
                "en": "Uploading..."
            },
            "dialog.delete.title": {
                "fr": "Supprimer le fichier ?",
                "en": "Delete file?"
            },
            "dialog.delete.description": {
                "fr": "Êtes-vous sûr de vouloir supprimer {filename} ? Cette action est irréversible.",
                "en": "Are you sure you want to delete {filename}? This action is irreversible."
            },
            "dialog.delete.cancel": {
                "fr": "Annuler",
                "en": "Cancel"
            },
            "dialog.delete.confirm": {
                "fr": "Supprimer",
                "en": "Delete"
            }
        }

        # Fonction pour créer les traductions
        def create_translations(namespace_code, translations_data):
            namespace = namespaces[namespace_code]
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

            print(f"\n📦 {namespace_code}:")
            print(f"  ✅ Traductions créées: {created_count}")
            print(f"  ⏭️  Traductions ignorées: {skipped_count}")
            print(f"  📊 Total de clés: {len(translations_data)}")

        # Créer les traductions pour chaque namespace
        create_translations("core.queue", queue_translations)
        create_translations("core.storage", storage_translations)

        print("\n✅ Seed des traductions CORE terminé avec succès!")


if __name__ == "__main__":
    asyncio.run(seed_core_translations())
