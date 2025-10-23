"""
Script pour créer les widgets de base dans le catalogue.
Ces widgets correspondent aux composants React déjà créés dans le frontend.
"""

from sqlmodel import Session, select, create_engine
from app.core.config import settings
from app.models_dashboard import Widget

def create_core_widgets():
    """Créer les widgets core dans la base de données"""
    engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))

    widgets_data = [
        {
            "widget_type": "stats_card",
            "name": "Carte de Statistiques",
            "description": "Affiche une statistique avec icône, valeur et tendance",
            "module_name": "core",
            "category": "stats",
            "icon": "trending-up",
            "required_permission": None,
            "is_active": True,
            "default_config": {
                "title": "Statistique",
                "value": 0,
                "trend": 0,
                "icon": "trending-up",
                "color": "blue"
            },
            "default_size": {
                "w": 3,
                "h": 2,
                "minW": 2,
                "minH": 2,
                "maxW": 6,
                "maxH": 4
            }
        },
        {
            "widget_type": "chart_line",
            "name": "Graphique en Ligne",
            "description": "Graphique temporel avec plusieurs séries de données",
            "module_name": "core",
            "category": "charts",
            "icon": "chart-line",
            "required_permission": None,
            "is_active": True,
            "default_config": {
                "title": "Tendance",
                "timeRange": "7d",
                "series": []
            },
            "default_size": {
                "w": 6,
                "h": 4,
                "minW": 4,
                "minH": 3,
                "maxW": 12,
                "maxH": 8
            }
        },
        {
            "widget_type": "progress_card",
            "name": "Carte de Progression",
            "description": "Affiche une barre de progression avec pourcentage",
            "module_name": "core",
            "category": "stats",
            "icon": "progress",
            "required_permission": None,
            "is_active": True,
            "default_config": {
                "title": "Progression",
                "value": 0,
                "max": 100,
                "color": "blue"
            },
            "default_size": {
                "w": 3,
                "h": 2,
                "minW": 2,
                "minH": 2,
                "maxW": 6,
                "maxH": 3
            }
        },
        {
            "widget_type": "recent_activity",
            "name": "Activité Récente",
            "description": "Liste des activités récentes du système",
            "module_name": "core",
            "category": "lists",
            "icon": "activity",
            "required_permission": None,
            "is_active": True,
            "default_config": {
                "title": "Activité Récente",
                "limit": 10,
                "showAvatar": True
            },
            "default_size": {
                "w": 4,
                "h": 4,
                "minW": 3,
                "minH": 3,
                "maxW": 8,
                "maxH": 8
            }
        },
        {
            "widget_type": "task_list",
            "name": "Liste de Tâches",
            "description": "Affiche une liste de tâches à accomplir",
            "module_name": "core",
            "category": "lists",
            "icon": "checklist",
            "required_permission": None,
            "is_active": True,
            "default_config": {
                "title": "Mes Tâches",
                "filter": "assigned_to_me",
                "limit": 10
            },
            "default_size": {
                "w": 4,
                "h": 4,
                "minW": 3,
                "minH": 3,
                "maxW": 8,
                "maxH": 8
            }
        },
        {
            "widget_type": "user_stats",
            "name": "Statistiques Utilisateurs",
            "description": "Affiche des statistiques sur les utilisateurs du système",
            "module_name": "core",
            "category": "analytics",
            "icon": "users",
            "required_permission": "users.read",
            "is_active": True,
            "default_config": {
                "title": "Utilisateurs",
                "showActive": True,
                "showNew": True
            },
            "default_size": {
                "w": 6,
                "h": 3,
                "minW": 4,
                "minH": 2,
                "maxW": 12,
                "maxH": 6
            }
        }
    ]

    with Session(engine) as session:
        print("Création des widgets core...")
        created_count = 0
        updated_count = 0

        for widget_data in widgets_data:
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
        print(f"   - {created_count} widgets créés")
        print(f"   - {updated_count} widgets mis à jour")
        print(f"   - Total: {created_count + updated_count} widgets dans le catalogue")

if __name__ == "__main__":
    create_core_widgets()
