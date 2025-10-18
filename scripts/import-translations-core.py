#!/usr/bin/env python3
"""
Import les traductions CORE via l'API backend
"""

import json
import requests
import sys

API_URL = "http://localhost:8000"
ADMIN_EMAIL = "admin@opsflux.io"
ADMIN_PASSWORD = "RldgAHG%Jqlrq6T*RjsZq3is"

# Chargement des traductions
with open('frontend/translations-core.json', 'r', encoding='utf-8') as f:
    translations_data = json.load(f)

# Traductions anglaises complètes
EN_TRANSLATIONS = {
    # Cache
    "page.title": "Cache Management",
    "page.description": "Redis cache monitoring and management",
    "status.label": "Redis Status",
    "status.connected": "Connected",
    "status.disconnected": "Disconnected",
    "status.backend": "Backend",
    "actions.refresh": "Refresh",
    "actions.clear_cache": "Clear cache",
    "stats.hits": "Hits",
    "stats.hits_description": "Requests found in cache",
    "stats.misses": "Misses",
    "stats.misses_description": "Requests not found",
    "stats.hit_rate": "Hit rate",
    "stats.hit_rate_description": "Cache efficiency",
    "stats.total_requests": "Total requests",
    "stats.total_requests_description": "Hits + Misses",
    "operations.title": "Operations",
    "operations.description": "Cache operations statistics",
    "operations.sets": "Sets",
    "operations.deletes": "Deletes",
    "operations.redis_hits": "Redis Hits",
    "recommendations.title": "Recommendations",
    "recommendations.low_hit_rate": "Low hit rate",
    "recommendations.low_hit_rate_description": "Consider increasing TTLs or reviewing cache strategy",
    "recommendations.excellent_performance": "Excellent cache performance",
    "recommendations.excellent_performance_description": "Cache is well optimized",
    "dialog.clear.title": "Clear cache?",
    "dialog.clear.description": "This action will delete all cached data. The application will continue to work but performance may be temporarily reduced.",
    "dialog.clear.cancel": "Cancel",
    "dialog.clear.confirm": "Clear cache",
    "dialog.clear.confirming": "In progress...",
    "toast.clear.success": "Cache cleared",
    "toast.clear.success_description": "{keys_deleted} keys deleted",
    "toast.error.title": "Error",
    "toast.error.load": "Unable to load cache data.",

    # Storage
    "actions.search": "Search for a file...",
    "actions.category": "Category",
    "actions.category_all": "All",
    "actions.category_documents": "Documents",
    "actions.category_images": "Images",
    "actions.category_videos": "Videos",
    "actions.category_audio": "Audio",
    "actions.category_archives": "Archives",
    "actions.upload": "Upload",
    "stats.total_files": "Total files",
    "stats.total_size": "Total size",
    "stats.categories": "Categories",
    "files.title": "Files",
    "files.count": "{count} file(s)",
    "files.search_results": "matching \"{query}\"",
    "files.empty": "No files",
    "dialog.upload.title": "Upload a file",
    "dialog.upload.description": "Select a file to upload to the server",
    "dialog.upload.file_label": "File",
    "dialog.upload.size_label": "Size",
    "dialog.upload.cancel": "Cancel",
    "dialog.upload.confirm": "Upload",
    "dialog.upload.uploading": "Uploading...",
    "dialog.delete.title": "Delete file?",
    "dialog.delete.description": "Are you sure you want to delete {filename}? This action is irreversible.",
    "dialog.delete.cancel": "Cancel",
    "dialog.delete.confirm": "Delete",
    "toast.upload.success": "File uploaded",
    "toast.upload.success_description": "{filename} was successfully uploaded.",
    "toast.upload.error": "Upload error",
    "toast.delete.success": "File deleted",
    "toast.delete.success_description": "{filename} was deleted.",
    "toast.error.delete": "Unable to delete file.",

    # Queue
    "workers.active_label": "Active workers",
    "stats.active_tasks": "Active tasks",
    "stats.active_tasks_description": "Currently running",
    "stats.scheduled_tasks": "Scheduled tasks",
    "stats.scheduled_tasks_description": "Programmed",
    "stats.reserved_tasks": "Reserved tasks",
    "stats.reserved_tasks_description": "Pre-allocated",
    "stats.workers": "Workers",
    "stats.workers_description": "Connected",
    "workers.title": "Workers",
    "workers.description": "Celery workers status",
    "workers.empty": "No worker connected",
    "workers.empty_description": "Start Celery workers to process tasks",
    "workers.status_active": "Active",
    "workers.active": "Active",
    "workers.scheduled": "Scheduled",
    "workers.reserved": "Reserved",
    "queues.title": "Queues",
    "queues.description": "Queues status",
    "queues.tasks_count": "{count} task(s)",
    "info.title": "Information",
    "info.workers": "Celery workers process asynchronous tasks in the background",
    "info.distribution": "Tasks are distributed according to their priority and queue",
    "info.scaling": "Workers can be scaled horizontally",
    "status.success": "Success",
    "status.pending": "Pending",
    "status.started": "Started",
    "status.failure": "Failure",
    "status.retry": "Retry",

    # Metrics
    "total.label": "Total metrics",
    "actions.reset": "Reset",
    "stats.total": "Total metrics",
    "stats.total_description": "All categories",
    "stats.counters": "Counters",
    "stats.counters_description": "Cumulative metrics",
    "stats.gauges": "Gauges",
    "stats.gauges_description": "Instant values",
    "stats.histograms": "Histograms",
    "stats.histograms_description": "Distributions",
    "metrics.title": "Available metrics",
    "metrics.description": "Detailed view of all collected metrics",
    "metrics.empty": "No metrics collected",
    "metrics.value": "Value",
    "metrics.no_data": "No data",
    "metrics.count": "Count",
    "metrics.sum": "Sum",
    "metrics.buckets": "Buckets",
    "info.counters": "Counters: Cumulative metrics that can only increase",
    "info.gauges": "Gauges: Values that can increase or decrease",
    "info.histograms": "Histograms: Value distribution with buckets",
    "info.prometheus": "Metrics are exported in Prometheus format on /metrics",
    "dialog.reset.title": "Reset metrics?",
    "dialog.reset.description": "This action will reset all metrics to zero. Historical data will be lost. This operation is typically used for testing or debugging.",
    "dialog.reset.cancel": "Cancel",
    "dialog.reset.confirm": "Reset",
    "dialog.reset.resetting": "Resetting...",
    "toast.reset.success": "Metrics reset",
    "toast.reset.success_description": "All metrics have been reset to zero.",
    "toast.error.reset": "Unable to reset metrics.",
}

def login():
    """Login et retourne le token"""
    print("🔑 Connexion à l'API...")
    response = requests.post(
        f"{API_URL}/api/v1/login/access-token",
        data={"username": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )

    if response.status_code != 200:
        print(f"❌ Erreur de connexion: {response.text}")
        sys.exit(1)

    token = response.json()["access_token"]
    print("✅ Connecté avec succès")
    return token

def get_namespaces(token):
    """Récupère les namespaces CORE"""
    print("\n📦 Récupération des namespaces...")
    response = requests.get(
        f"{API_URL}/api/v1/languages/namespaces/",
        headers={"Authorization": f"Bearer {token}"}
    )

    if response.status_code != 200:
        print(f"❌ Erreur: {response.text}")
        return {}

    namespaces = {}
    data = response.json()
    items = data if isinstance(data, list) else data.get("data", [])

    for ns in items:
        if ns["code"].startswith("core."):
            namespaces[ns["code"]] = ns["id"]
            print(f"  ✓ {ns['code']} ({ns['id']})")

    return namespaces

def get_languages(token):
    """Récupère les langues actives"""
    print("\n🌍 Récupération des langues...")
    response = requests.get(
        f"{API_URL}/api/v1/languages/?is_active=true",
        headers={"Authorization": f"Bearer {token}"}
    )

    if response.status_code != 200:
        print(f"❌ Erreur: {response.text}")
        return {}

    languages = {}
    data = response.json()
    items = data if isinstance(data, list) else data.get("data", [])

    for lang in items:
        languages[lang["code"]] = lang["id"]
        print(f"  ✓ {lang['code']} - {lang['name']} ({lang['id']})")

    return languages

def bulk_import_translations(token, namespace_id, language_id, translations_dict):
    """Importe des traductions en masse via l'endpoint bulk"""
    payload = {
        "namespace_id": namespace_id,
        "language_id": language_id,
        "translations": translations_dict,
        "overwrite_existing": True
    }

    response = requests.post(
        f"{API_URL}/api/v1/languages/translations/import",
        json=payload,
        headers={"Authorization": f"Bearer {token}"}
    )

    if response.status_code not in [200, 201]:
        print(f"      ❌ ERROR: {response.status_code} - {response.text}")
        return False, 0, 0

    # Parse le message de retour: "Import completed: X created, Y updated"
    result = response.json()
    message = result.get("message", "")
    return True, message

def import_translations(token, namespaces, languages):
    """Importe toutes les traductions"""
    print("\n📝 Importation des traductions...")

    total_created = 0
    total_updated = 0
    errors = 0

    for namespace_code, keys in translations_data.items():
        if namespace_code not in namespaces:
            print(f"⚠️  Namespace {namespace_code} non trouvé, ignoré")
            continue

        namespace_id = namespaces[namespace_code]
        print(f"\n  📂 {namespace_code}")

        # Import FR
        if "fr" in languages:
            print(f"    🇫🇷 Import Français...")
            success, message = bulk_import_translations(token, namespace_id, languages["fr"], keys)
            if success:
                print(f"       ✅ {message}")
                # Extraire les nombres du message
                import re
                matches = re.findall(r'(\d+)', message)
                if len(matches) >= 2:
                    total_created += int(matches[0])
                    total_updated += int(matches[1])
            else:
                errors += 1

        # Import EN (construire le dict avec les traductions EN)
        if "en" in languages:
            print(f"    🇬🇧 Import Anglais...")
            en_translations = {key: EN_TRANSLATIONS.get(key, value_fr) for key, value_fr in keys.items()}
            success, message = bulk_import_translations(token, namespace_id, languages["en"], en_translations)
            if success:
                print(f"       ✅ {message}")
                # Extraire les nombres du message
                import re
                matches = re.findall(r'(\d+)', message)
                if len(matches) >= 2:
                    total_created += int(matches[0])
                    total_updated += int(matches[1])
            else:
                errors += 1

    print(f"\n{'='*60}")
    print(f"📊 Résumé:")
    print(f"  ✅ Créées: {total_created}")
    print(f"  🔄 Mises à jour: {total_updated}")
    print(f"  ❌ Erreurs: {errors}")
    print(f"{'='*60}")

def main():
    """Fonction principale"""
    print("="*60)
    print("🚀 Import des traductions CORE")
    print("="*60)

    try:
        token = login()
        namespaces = get_namespaces(token)
        languages = get_languages(token)

        if not namespaces:
            print("❌ Aucun namespace CORE trouvé!")
            sys.exit(1)

        if not languages:
            print("❌ Aucune langue active trouvée!")
            sys.exit(1)

        import_translations(token, namespaces, languages)

        print("\n✅ Import terminé avec succès!")

    except Exception as e:
        print(f"\n❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
