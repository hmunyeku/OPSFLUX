"""
Script pour nettoyer les hooks en doublon créés par les multiples activations/désactivations.

Ce script:
1. Identifie les hooks en doublon (même event, même nom)
2. Garde le hook le plus récent
3. Supprime les anciens doublons
4. Affiche un rapport

Usage:
    python scripts/clean_duplicate_hooks.py
"""

import sys
from pathlib import Path

# Ajouter le dossier parent au path pour permettre l'import de app
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlmodel import Session, select, func
from app.core.db import engine
from app.models_hooks import Hook


def clean_duplicate_hooks():
    """
    Nettoie les hooks en doublon.
    """
    with Session(engine) as session:
        print("🔍 Recherche des hooks en doublon...")

        # Récupérer tous les hooks
        statement = select(Hook)
        all_hooks = session.exec(statement).all()

        print(f"📊 Total des hooks: {len(all_hooks)}")

        # Grouper par (event, name)
        hooks_by_key = {}
        for hook in all_hooks:
            key = (hook.event, hook.name)
            if key not in hooks_by_key:
                hooks_by_key[key] = []
            hooks_by_key[key].append(hook)

        # Identifier les doublons
        duplicates = {k: v for k, v in hooks_by_key.items() if len(v) > 1}

        if not duplicates:
            print("✅ Aucun doublon trouvé!")
            return

        print(f"⚠️  {len(duplicates)} groupes de doublons trouvés:")
        print()

        total_removed = 0

        for (event, name), hooks in duplicates.items():
            print(f"Event: {event}")
            print(f"  Nom: {name}")
            print(f"  Nombre de doublons: {len(hooks)}")

            # Trier par created_at (garder le plus récent)
            hooks_sorted = sorted(hooks, key=lambda h: h.created_at, reverse=True)

            # Garder le premier (le plus récent)
            to_keep = hooks_sorted[0]
            to_remove = hooks_sorted[1:]

            print(f"  ✓ Garde: {to_keep.id} (créé le {to_keep.created_at})")

            for hook in to_remove:
                print(f"  ✗ Supprime: {hook.id} (créé le {hook.created_at})")
                session.delete(hook)
                total_removed += 1

            print()

        if total_removed > 0:
            print(f"💾 Sauvegarde des modifications...")
            session.commit()
            print(f"✅ {total_removed} hooks en doublon supprimés!")
        else:
            print("✅ Aucune modification nécessaire")


if __name__ == "__main__":
    try:
        clean_duplicate_hooks()
    except Exception as e:
        print(f"❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
