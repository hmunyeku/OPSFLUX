#!/usr/bin/env python3
"""
Script pour appliquer automatiquement l'i18n aux pages CORE
"""

import re
import json
from pathlib import Path

# Chargement des traductions
with open('frontend/translations-core.json', 'r', encoding='utf-8') as f:
    translations = json.load(f)

# Mappage des textes vers les clés de traduction
MAPPINGS = {
    'cache': {
        # Textes -> Clés
        'Gestion du Cache': 'core.cache.page.title',
        'Monitoring et gestion du cache Redis': 'core.cache.page.description',
        'Redis Status': 'core.cache.status.label',
        'Connecté': 'core.cache.status.connected',
        'Déconnecté': 'core.cache.status.disconnected',
        'Backend': 'core.cache.status.backend',
        'Actualiser': 'core.cache.actions.refresh',
        'Vider le cache': 'core.cache.actions.clear_cache',
        'Hits': 'core.cache.stats.hits',
        'Requêtes trouvées dans le cache': 'core.cache.stats.hits_description',
        # ... etc
    },
    # Autres pages...
}

def add_use_translation_import(content):
    """Ajoute l'import useTranslation si pas déjà présent"""
    if 'use-translation' in content:
        return content

    # Trouver la dernière import
    import_pattern = r'(import .+ from "@/[^"]+")\n'
    imports = list(re.finditer(import_pattern, content))

    if imports:
        last_import = imports[-1]
        insert_pos = last_import.end()
        new_import = 'import { useTranslation } from "@/hooks/use-translation"\n'
        content = content[:insert_pos] + new_import + content[insert_pos:]

    return content

def add_translation_hook(content, namespace):
    """Ajoute le hook useTranslation dans le composant"""
    # Rechercher la ligne avec useToast
    toast_pattern = r'(\s+const \{ toast \} = useToast\(\))'
    match = re.search(toast_pattern, content)

    if match:
        insert_pos = match.end()
        new_hook = f'\n  const {{ t }} = useTranslation("{namespace}")'
        content = content[:insert_pos] + new_hook + content[insert_pos:]

    return content

def replace_hardcoded_strings(content, mappings):
    """Remplace les chaînes en dur par les appels t()"""
    for text, key in mappings.items():
        # Échapper les caractères spéciaux
        escaped_text = re.escape(text)

        # Pattern pour les chaînes entre guillemets
        pattern = f'(["\']){escaped_text}\\1'
        replacement = f'{{t("{key}")}}'
        content = re.sub(pattern, replacement, content)

    return content

def process_file(file_path, namespace, mappings):
    """Traite un fichier"""
    print(f"Traitement de {file_path}...")

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Ajouter l'import
    content = add_use_translation_import(content)

    # 2. Ajouter le hook
    content = add_translation_hook(content, namespace)

    # 3. Remplacer les chaînes
    content = replace_hardcoded_strings(content, mappings)

    # Sauvegarder
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"✓ {file_path} traité")

if __name__ == '__main__':
    # Liste des fichiers à traiter
    files = {
        'frontend/src/app/(dashboard)/settings/cache/page.tsx': ('core.cache', MAPPINGS['cache']),
        # Ajoutez les autres fichiers ici
    }

    for file_path, (namespace, mappings) in files.items():
        if Path(file_path).exists():
            process_file(file_path, namespace, mappings)
        else:
            print(f"✗ Fichier non trouvé: {file_path}")

    print("\nTerminé!")
