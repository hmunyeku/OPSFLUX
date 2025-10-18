#!/usr/bin/env python3
"""
Génère les requêtes SQL pour insérer les traductions CORE en base de données
"""

import json
import uuid
from datetime import datetime

# Chargement des traductions
with open('frontend/translations-core.json', 'r', encoding='utf-8') as f:
    translations_data = json.load(f)

# Langues configurées (à adapter selon votre base)
LANGUAGES = {
    'fr': 'fr',  # Français par défaut
    'en': 'en',  # Anglais
    'es': 'es',  # Espagnol
}

# Traductions anglaises (traduction automatique)
EN_TRANSLATIONS = {
    "core.cache.page.title": "Cache Management",
    "core.cache.page.description": "Redis cache monitoring and management",
    "core.cache.status.label": "Redis Status",
    "core.cache.status.connected": "Connected",
    "core.cache.status.disconnected": "Disconnected",
    "core.cache.status.backend": "Backend",
    "core.cache.actions.refresh": "Refresh",
    "core.cache.actions.clear_cache": "Clear cache",
    "core.cache.stats.hits": "Hits",
    "core.cache.stats.hits_description": "Requests found in cache",
    "core.cache.stats.misses": "Misses",
    "core.cache.stats.misses_description": "Requests not found",
    "core.cache.stats.hit_rate": "Hit rate",
    "core.cache.stats.hit_rate_description": "Cache efficiency",
    "core.cache.stats.total_requests": "Total requests",
    "core.cache.stats.total_requests_description": "Hits + Misses",
    "core.cache.operations.title": "Operations",
    "core.cache.operations.description": "Cache operations statistics",
    "core.cache.operations.sets": "Sets",
    "core.cache.operations.deletes": "Deletes",
    "core.cache.operations.redis_hits": "Redis Hits",
    "core.cache.recommendations.title": "Recommendations",
    "core.cache.recommendations.low_hit_rate": "Low hit rate",
    "core.cache.recommendations.low_hit_rate_description": "Consider increasing TTLs or reviewing cache strategy",
    "core.cache.recommendations.excellent_performance": "Excellent cache performance",
    "core.cache.recommendations.excellent_performance_description": "Cache is well optimized",
    "core.cache.dialog.clear.title": "Clear cache?",
    "core.cache.dialog.clear.description": "This action will delete all cached data. The application will continue to work but performance may be temporarily reduced.",
    "core.cache.dialog.clear.cancel": "Cancel",
    "core.cache.dialog.clear.confirm": "Clear cache",
    "core.cache.dialog.clear.confirming": "In progress...",
    "core.cache.toast.clear.success": "Cache cleared",
    "core.cache.toast.clear.success_description": "{keys_deleted} keys deleted",
    "core.cache.toast.error.title": "Error",
    "core.cache.toast.error.load": "Unable to load cache data.",

    # Storage
    "core.storage.page.title": "File Management",
    "core.storage.page.description": "Upload, manage and store files",
    "core.storage.actions.search": "Search for a file...",
    "core.storage.actions.category": "Category",
    "core.storage.actions.category_all": "All",
    "core.storage.actions.category_documents": "Documents",
    "core.storage.actions.category_images": "Images",
    "core.storage.actions.category_videos": "Videos",
    "core.storage.actions.category_audio": "Audio",
    "core.storage.actions.category_archives": "Archives",
    "core.storage.actions.refresh": "Refresh",
    "core.storage.actions.upload": "Upload",
    "core.storage.stats.total_files": "Total files",
    "core.storage.stats.total_size": "Total size",
    "core.storage.stats.categories": "Categories",
    "core.storage.files.title": "Files",
    "core.storage.files.count": "{count} file(s)",
    "core.storage.files.search_results": "matching \"{query}\"",
    "core.storage.files.empty": "No files",

    # Queue
    "core.queue.page.title": "Tasks Management",
    "core.queue.page.description": "Celery workers and asynchronous queues monitoring",
    "core.queue.workers.active_label": "Active workers",
    "core.queue.actions.refresh": "Refresh",
    "core.queue.stats.active_tasks": "Active tasks",
    "core.queue.stats.active_tasks_description": "Currently running",
    "core.queue.stats.scheduled_tasks": "Scheduled tasks",
    "core.queue.stats.scheduled_tasks_description": "Programmed",
    "core.queue.stats.reserved_tasks": "Reserved tasks",
    "core.queue.stats.reserved_tasks_description": "Pre-allocated",
    "core.queue.stats.workers": "Workers",
    "core.queue.stats.workers_description": "Connected",

    # Metrics
    "core.metrics.page.title": "Metrics & Monitoring",
    "core.metrics.page.description": "Performance metrics monitoring and analysis",
    "core.metrics.total.label": "Total metrics",
    "core.metrics.actions.refresh": "Refresh",
    "core.metrics.actions.reset": "Reset",
    "core.metrics.stats.total": "Total metrics",
    "core.metrics.stats.total_description": "All categories",
    "core.metrics.stats.counters": "Counters",
    "core.metrics.stats.counters_description": "Cumulative metrics",
    "core.metrics.stats.gauges": "Gauges",
    "core.metrics.stats.gauges_description": "Instant values",
}

def generate_sql():
    """Génère le SQL pour insérer les traductions"""

    print("-- Script de création des traductions CORE")
    print("-- Généré le", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    print()

    # Créer les namespaces
    namespaces = set()
    for namespace_key in translations_data.keys():
        namespace_code = namespace_key
        namespace_name = namespace_code.replace('core.', '').replace('_', ' ').title()
        namespaces.add((namespace_code, namespace_name))

    print("-- Création des namespaces")
    for ns_code, ns_name in namespaces:
        ns_id = str(uuid.uuid4())
        print(f"""
INSERT INTO translation_namespace (id, code, name, description, is_system, created_at, updated_at)
VALUES ('{ns_id}', '{ns_code}', '{ns_name}', 'CORE - {ns_name}', true, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;
""")

    print("\n-- Création des clés de traduction")

    # Collecter toutes les clés uniques
    all_keys = {}
    for namespace_key, keys in translations_data.items():
        for key, value_fr in keys.items():
            full_key = f"{key}"
            if full_key not in all_keys:
                all_keys[full_key] = {
                    'namespace': namespace_key,
                    'key': key,
                    'fr': value_fr,
                    'en': EN_TRANSLATIONS.get(full_key, value_fr),  # Fallback FR si pas de traduction EN
                }

    # Générer les INSERT pour les clés
    for full_key, data in all_keys.items():
        key_id = str(uuid.uuid4())
        print(f"""
INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('{key_id}', '{data['key']}', '{data['namespace']}', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;
""")

    print("\n-- Création des traductions")

    # Générer les INSERT pour les traductions
    for full_key, data in all_keys.items():
        # Français
        trans_id_fr = str(uuid.uuid4())
        value_fr = data['fr'].replace("'", "''")  # Échapper les apostrophes
        print(f"""
INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '{trans_id_fr}', '{data['key']}', '{data['namespace']}', 'fr', '{value_fr}', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = '{data['key']}' AND namespace_code = '{data['namespace']}')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
""")

        # Anglais
        trans_id_en = str(uuid.uuid4())
        value_en = data['en'].replace("'", "''")  # Échapper les apostrophes
        print(f"""
INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '{trans_id_en}', '{data['key']}', '{data['namespace']}', 'en', '{value_en}', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = '{data['key']}' AND namespace_code = '{data['namespace']}')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
""")

    print("\n-- Fin du script")
    print(f"-- {len(all_keys)} clés créées")
    print(f"-- {len(all_keys) * 2} traductions créées (FR + EN)")

if __name__ == '__main__':
    generate_sql()
