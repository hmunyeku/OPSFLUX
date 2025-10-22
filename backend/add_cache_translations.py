from sqlmodel import Session, select
from app.core.db import engine
from app.models_i18n import TranslationNamespace, Translation, Language

# Traductions pour core.cache en français
translations = {
    "page.title": "Gestion du Cache",
    "page.description": "Surveillez et gérez le cache Redis de l'application pour optimiser les performances",

    "status.label": "Statut Redis",
    "status.connected": "Connecté",
    "status.disconnected": "Déconnecté",
    "status.backend": "Backend",

    "actions.refresh": "Actualiser",
    "actions.clear_cache": "Vider le cache",

    "stats.hits": "Hits",
    "stats.hits_description": "Nombre de requêtes trouvées en cache",
    "stats.misses": "Misses",
    "stats.misses_description": "Nombre de requêtes non trouvées en cache",
    "stats.hit_rate": "Taux de succès",
    "stats.hit_rate_description": "Pourcentage de requêtes servies par le cache",
    "stats.total_requests": "Total requêtes",
    "stats.total_requests_description": "Nombre total de requêtes au cache",

    "operations.title": "Statistiques d'opérations",
    "operations.description": "Détails des opérations effectuées sur le cache",
    "operations.sets": "Écritures",
    "operations.deletes": "Suppressions",
    "operations.redis_hits": "Hits Redis",

    "recommendations.title": "Recommandations",
    "recommendations.low_hit_rate": "Taux de succès faible",
    "recommendations.low_hit_rate_description": "Considérez d'augmenter la durée de vie (TTL) des entrées en cache",
    "recommendations.excellent_performance": "Excellentes performances",
    "recommendations.excellent_performance_description": "Votre cache est bien optimisé",

    "dialog.clear.title": "Vider le cache",
    "dialog.clear.description": "Êtes-vous sûr de vouloir vider tout le cache ? Cette action est irréversible et peut temporairement ralentir l'application.",
    "dialog.clear.cancel": "Annuler",
    "dialog.clear.confirm": "Vider",
    "dialog.clear.confirming": "Suppression en cours...",

    "toast.clear.success": "Cache vidé",
    "toast.clear.success_description": "{keys_deleted} clés supprimées avec succès"
}

with Session(engine) as session:
    # Récupérer le namespace core.cache
    namespace = session.exec(
        select(TranslationNamespace).where(TranslationNamespace.code == "core.cache")
    ).first()

    if not namespace:
        print("❌ Namespace core.cache introuvable!")
        exit(1)

    # Récupérer la langue française
    fr_lang = session.exec(
        select(Language).where(Language.code == "fr")
    ).first()

    if not fr_lang:
        print("❌ Langue française introuvable!")
        exit(1)

    print(f"✓ Namespace trouvé: {namespace.name}")
    print(f"✓ Langue trouvée: {fr_lang.name}")
    print(f"\nAjout de {len(translations)} traductions...")

    added = 0
    updated = 0

    for key, value in translations.items():
        # Vérifier si la traduction existe déjà
        existing = session.exec(
            select(Translation)
            .where(Translation.namespace_id == namespace.id)
            .where(Translation.language_id == fr_lang.id)
            .where(Translation.key == key)
        ).first()

        if existing:
            existing.value = value
            updated += 1
        else:
            translation = Translation(
                namespace_id=namespace.id,
                language_id=fr_lang.id,
                key=key,
                value=value
            )
            session.add(translation)
            added += 1

    session.commit()
    print(f"\n✅ Traductions ajoutées: {added}")
    print(f"✅ Traductions mises à jour: {updated}")
    print(f"✅ Total: {added + updated}")
