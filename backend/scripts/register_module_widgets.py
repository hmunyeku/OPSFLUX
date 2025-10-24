"""
Script pour enregistrer les widgets d'un module dans la base de données.

Ce script permet aux modules d'enregistrer leurs widgets dans la table 'widget'
afin qu'ils soient disponibles dans les dashboards.

Usage:
    python backend/scripts/register_module_widgets.py <module_code> [widgets_data.json]

Exemple:
    python backend/scripts/register_module_widgets.py third-parties
    python backend/scripts/register_module_widgets.py mon-module widgets.json

Format du fichier JSON (optionnel):
[
  {
    "widget_type": "mon_module_widget",
    "name": "Mon Widget",
    "description": "Description du widget",
    "module_name": "mon-module",
    "category": "stats",
    "icon": "chart-bar",
    "required_permission": "mon_module:read",
    "is_active": true,
    "default_config": {},
    "default_size": {"w": 4, "h": 3, "minW": 2, "minH": 2, "maxW": 12, "maxH": 6}
  }
]
"""

import sys
import json
from pathlib import Path
from sqlmodel import Session, select, create_engine

# Ajouter le répertoire racine au path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.config import settings
from app.models_dashboard import Widget


def register_widgets_from_file(module_code: str, widgets_file: Path):
    """Enregistre les widgets depuis un fichier JSON"""

    if not widgets_file.exists():
        print(f"❌ Fichier non trouvé: {widgets_file}")
        sys.exit(1)

    try:
        with open(widgets_file, 'r', encoding='utf-8') as f:
            widgets_data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"❌ Erreur de parsing JSON: {e}")
        sys.exit(1)

    if not isinstance(widgets_data, list):
        print("❌ Le fichier JSON doit contenir un tableau de widgets")
        sys.exit(1)

    engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))

    with Session(engine) as session:
        print(f"🔧 Enregistrement des widgets du module '{module_code}'...")
        created_count = 0
        updated_count = 0

        for widget_data in widgets_data:
            # Vérifier que le module_name correspond
            if widget_data.get('module_name') != module_code:
                print(f"⚠️  Widget '{widget_data.get('widget_type')}': module_name ne correspond pas (attendu: {module_code}, trouvé: {widget_data.get('module_name')})")
                widget_data['module_name'] = module_code

            # Vérifier si le widget existe déjà
            existing = session.exec(
                select(Widget).where(Widget.widget_type == widget_data["widget_type"])
            ).first()

            if existing:
                print(f"  ⚠️  Widget '{widget_data['name']}' existe déjà, mise à jour...")
                # Mettre à jour
                for key, value in widget_data.items():
                    setattr(existing, key, value)
                updated_count += 1
            else:
                print(f"  ✅ Création du widget '{widget_data['name']}'...")
                widget = Widget(**widget_data)
                session.add(widget)
                created_count += 1

        session.commit()
        print(f"\n✅ Terminé!")
        print(f"   - {created_count} widget(s) créé(s)")
        print(f"   - {updated_count} widget(s) mis à jour")
        print(f"   - Total: {created_count + updated_count} widget(s)")


def discover_widgets_from_registry(module_code: str):
    """
    Découvre automatiquement les widgets depuis le registry TypeScript du module

    Note: Cette fonctionnalité nécessite un parser TypeScript ou une convention
    pour exporter les widgets dans un format JSON lisible par Python.
    Pour l'instant, on recommande d'utiliser un fichier JSON explicite.
    """
    print("⚠️  La découverte automatique depuis le registry TypeScript n'est pas encore implémentée.")
    print("   Veuillez créer un fichier JSON avec la définition de vos widgets.")
    print("\n   Exemple:")
    print(f"   python backend/scripts/register_module_widgets.py {module_code} widgets.json")
    sys.exit(1)


def main():
    if len(sys.argv) < 2:
        print("Usage: python backend/scripts/register_module_widgets.py <module_code> [widgets_file.json]")
        print("\nExemple:")
        print("  python backend/scripts/register_module_widgets.py third-parties")
        print("  python backend/scripts/register_module_widgets.py mon-module widgets.json")
        sys.exit(1)

    module_code = sys.argv[1]

    if len(sys.argv) >= 3:
        # Fichier JSON fourni
        widgets_file = Path(sys.argv[2])
    else:
        # Chercher le fichier par défaut dans le module
        default_path = Path(f"modules/{module_code}/backend/widgets.json")
        if default_path.exists():
            widgets_file = default_path
        else:
            print(f"📋 Aucun fichier widgets.json trouvé pour le module '{module_code}'")
            discover_widgets_from_registry(module_code)
            return

    register_widgets_from_file(module_code, widgets_file)


if __name__ == "__main__":
    main()
