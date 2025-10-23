"""
Script pour créer un dashboard par défaut avec plusieurs widgets de base.
Ce dashboard sera obligatoire pour tous les utilisateurs (scope: global).
"""

from sqlmodel import Session, select, create_engine
from app.core.config import settings
from app.models_dashboard import Dashboard, Widget, DashboardWidget

def create_default_dashboard():
    """Créer un dashboard par défaut global"""
    engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))

    with Session(engine) as session:
        # Vérifier si un dashboard par défaut existe déjà
        existing = session.exec(
            select(Dashboard).where(
                Dashboard.is_default == True,
                Dashboard.scope == "global",
                Dashboard.deleted_at.is_(None)
            )
        ).first()

        if existing:
            print(f"✅ Un dashboard par défaut existe déjà: '{existing.name}' (ID: {existing.id})")
            # Compter les widgets
            widget_count = session.exec(
                select(DashboardWidget).where(
                    DashboardWidget.dashboard_id == existing.id,
                    DashboardWidget.deleted_at.is_(None)
                )
            ).all()
            print(f"   - Widgets: {len(widget_count)}")
            return

        print("Création du dashboard par défaut...")

        # Récupérer les widgets disponibles
        widgets = session.exec(select(Widget).where(Widget.is_active == True)).all()
        widget_map = {w.widget_type: w for w in widgets}

        # Créer le dashboard
        dashboard = Dashboard(
            name="Tableau de Bord Principal",
            description="Dashboard par défaut visible par tous les utilisateurs",
            is_default=True,
            is_mandatory=True,
            scope="global",
            is_active=True,
            is_public=True,
            order=0,
            layout_config={
                "column": 12,
                "cellHeight": 70,
                "margin": 10
            }
        )
        session.add(dashboard)
        session.flush()

        # Configuration des widgets à ajouter avec leurs positions
        # Note: On ne peut avoir qu'une seule instance de chaque widget par dashboard
        # à cause de la contrainte unique (dashboard_id, widget_id)
        widgets_to_add = [
            {
                "widget_type": "stats_card",
                "x": 0, "y": 0, "w": 4, "h": 2,
                "config": {
                    "title": "Utilisateurs Actifs",
                    "icon": "users",
                    "color": "blue"
                }
            },
            {
                "widget_type": "progress_card",
                "x": 4, "y": 0, "w": 4, "h": 2,
                "config": {
                    "title": "Progression Mensuelle",
                    "value": 65,
                    "max": 100,
                    "color": "purple"
                }
            },
            {
                "widget_type": "user_stats",
                "x": 8, "y": 0, "w": 4, "h": 2,
                "config": {
                    "title": "Statistiques"
                }
            },
            {
                "widget_type": "chart_line",
                "x": 0, "y": 2, "w": 8, "h": 4,
                "config": {
                    "title": "Activité des 7 derniers jours",
                    "timeRange": "7d"
                }
            },
            {
                "widget_type": "recent_activity",
                "x": 8, "y": 2, "w": 4, "h": 4,
                "config": {
                    "title": "Activité Récente",
                    "limit": 10
                }
            },
            {
                "widget_type": "task_list",
                "x": 0, "y": 6, "w": 12, "h": 4,
                "config": {
                    "title": "Mes Tâches",
                    "filter": "assigned_to_me"
                }
            }
        ]

        added_count = 0
        for widget_config in widgets_to_add:
            widget_type = widget_config["widget_type"]
            if widget_type in widget_map:
                widget = widget_map[widget_type]
                dashboard_widget = DashboardWidget(
                    dashboard_id=dashboard.id,
                    widget_id=widget.id,
                    x=widget_config["x"],
                    y=widget_config["y"],
                    w=widget_config["w"],
                    h=widget_config["h"],
                    config=widget_config["config"],
                    is_visible=True,
                    order=added_count
                )
                session.add(dashboard_widget)
                added_count += 1
                print(f"  ✅ Widget '{widget.name}' ajouté au dashboard")
            else:
                print(f"  ⚠️  Widget '{widget_type}' non trouvé, ignoré")

        session.commit()

        print(f"\n✅ Dashboard par défaut créé avec succès!")
        print(f"   - Nom: {dashboard.name}")
        print(f"   - ID: {dashboard.id}")
        print(f"   - Widgets: {added_count}")
        print(f"   - Scope: {dashboard.scope} (visible par tous)")

if __name__ == "__main__":
    create_default_dashboard()
