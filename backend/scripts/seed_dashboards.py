#!/usr/bin/env python3
"""
Seed script for dashboards and widgets
Run: docker exec opsflux-backend-1 python scripts/seed_dashboards.py
"""
import uuid
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.core.db import engine
# Import User model first to resolve foreign keys
from app.models import User
from app.models_dashboards import (
    Dashboard,
    DashboardSystemWidget,
    MenuParentEnum,
    WidgetTypeEnum,
    DataSourceTypeEnum,
    RefreshIntervalEnum,
)


def seed_dashboards():
    """Create test dashboards with widgets"""

    with Session(engine) as session:
        # Check if dashboards already exist
        existing = session.exec(select(Dashboard)).first()
        if existing:
            print("Dashboards already seeded. Skipping.")
            return

        now = datetime.now(timezone.utc)

        # Dashboard 1: Vue d'ensemble Pilotage
        dash1 = Dashboard(
            id=uuid.uuid4(),
            name="Vue d'ensemble",
            description="Dashboard principal avec KPIs et métriques clés",
            menu_parent=MenuParentEnum.PILOTAGE,
            menu_label="Vue d'ensemble",
            menu_icon="LayoutDashboard",
            menu_order=1,
            show_in_sidebar=True,
            is_home_page=True,
            is_public=True,
            auto_refresh=True,
            refresh_interval=RefreshIntervalEnum.ONE_MINUTE,
            enable_filters=True,
            enable_export=True,
            enable_fullscreen=True,
            created_at=now,
            updated_at=now,
        )
        session.add(dash1)
        session.flush()

        # Widgets for Dashboard 1
        widgets1 = [
            DashboardSystemWidget(
                id=uuid.uuid4(),
                dashboard_id=dash1.id,
                name="Personnel actif",
                widget_type=WidgetTypeEnum.STATS_CARD,
                position_x=0, position_y=0, width=3, height=2,
                data_source_type=DataSourceTypeEnum.API,
                data_source_config={"endpoint": "/api/v1/stats/personnel"},
                widget_config={"title": "Personnel actif", "icon": "Users", "color": "blue"},
            ),
            DashboardSystemWidget(
                id=uuid.uuid4(),
                dashboard_id=dash1.id,
                name="Vols aujourd'hui",
                widget_type=WidgetTypeEnum.STATS_CARD,
                position_x=3, position_y=0, width=3, height=2,
                data_source_type=DataSourceTypeEnum.API,
                data_source_config={"endpoint": "/api/v1/stats/flights"},
                widget_config={"title": "Vols aujourd'hui", "icon": "Plane", "color": "green"},
            ),
            DashboardSystemWidget(
                id=uuid.uuid4(),
                dashboard_id=dash1.id,
                name="Cargo en transit",
                widget_type=WidgetTypeEnum.STATS_CARD,
                position_x=6, position_y=0, width=3, height=2,
                data_source_type=DataSourceTypeEnum.API,
                data_source_config={"endpoint": "/api/v1/stats/cargo"},
                widget_config={"title": "Cargo en transit", "icon": "Package", "color": "orange"},
            ),
            DashboardSystemWidget(
                id=uuid.uuid4(),
                dashboard_id=dash1.id,
                name="Alertes",
                widget_type=WidgetTypeEnum.STATS_CARD,
                position_x=9, position_y=0, width=3, height=2,
                data_source_type=DataSourceTypeEnum.API,
                data_source_config={"endpoint": "/api/v1/stats/alerts"},
                widget_config={"title": "Alertes", "icon": "AlertTriangle", "color": "red"},
            ),
            DashboardSystemWidget(
                id=uuid.uuid4(),
                dashboard_id=dash1.id,
                name="Activité hebdomadaire",
                widget_type=WidgetTypeEnum.LINE_CHART,
                position_x=0, position_y=2, width=8, height=4,
                data_source_type=DataSourceTypeEnum.API,
                data_source_config={"endpoint": "/api/v1/stats/weekly"},
                widget_config={"title": "Activité hebdomadaire"},
            ),
            DashboardSystemWidget(
                id=uuid.uuid4(),
                dashboard_id=dash1.id,
                name="Activité récente",
                widget_type=WidgetTypeEnum.LIST,
                position_x=8, position_y=2, width=4, height=4,
                data_source_type=DataSourceTypeEnum.API,
                data_source_config={"endpoint": "/api/v1/activity"},
                widget_config={"title": "Activité récente", "limit": 10},
            ),
        ]
        for w in widgets1:
            session.add(w)

        # Dashboard 2: Logistique TravelWiz
        dash2 = Dashboard(
            id=uuid.uuid4(),
            name="Logistique & Rotations",
            description="Suivi des rotations, manifests et cargo",
            menu_parent=MenuParentEnum.TRAVELWIZ,
            menu_label="Logistique",
            menu_icon="Truck",
            menu_order=2,
            show_in_sidebar=True,
            is_public=True,
            created_at=now,
            updated_at=now,
        )
        session.add(dash2)
        session.flush()

        widgets2 = [
            DashboardSystemWidget(
                id=uuid.uuid4(),
                dashboard_id=dash2.id,
                name="Manifests en cours",
                widget_type=WidgetTypeEnum.TABLE,
                position_x=0, position_y=0, width=12, height=5,
                data_source_type=DataSourceTypeEnum.API,
                data_source_config={"endpoint": "/api/v1/manifests"},
                widget_config={"title": "Manifests en cours"},
            ),
            DashboardSystemWidget(
                id=uuid.uuid4(),
                dashboard_id=dash2.id,
                name="Cargo par destination",
                widget_type=WidgetTypeEnum.BAR_CHART,
                position_x=0, position_y=5, width=6, height=4,
                data_source_type=DataSourceTypeEnum.API,
                data_source_config={"endpoint": "/api/v1/stats/cargo-by-dest"},
                widget_config={"title": "Cargo par destination"},
            ),
            DashboardSystemWidget(
                id=uuid.uuid4(),
                dashboard_id=dash2.id,
                name="Occupation vols",
                widget_type=WidgetTypeEnum.PIE_CHART,
                position_x=6, position_y=5, width=6, height=4,
                data_source_type=DataSourceTypeEnum.API,
                data_source_config={"endpoint": "/api/v1/stats/flight-occupancy"},
                widget_config={"title": "Occupation vols"},
            ),
        ]
        for w in widgets2:
            session.add(w)

        # Dashboard 3: Gestion Personnel POBVue
        dash3 = Dashboard(
            id=uuid.uuid4(),
            name="Gestion Personnel",
            description="Personnel offshore et certifications",
            menu_parent=MenuParentEnum.POBVUE,
            menu_label="Personnel",
            menu_icon="Users",
            menu_order=1,
            show_in_sidebar=True,
            is_public=True,
            created_at=now,
            updated_at=now,
        )
        session.add(dash3)
        session.flush()

        widgets3 = [
            DashboardSystemWidget(
                id=uuid.uuid4(),
                dashboard_id=dash3.id,
                name="Personnel offshore",
                widget_type=WidgetTypeEnum.STATS_CARD,
                position_x=0, position_y=0, width=4, height=2,
                data_source_type=DataSourceTypeEnum.API,
                data_source_config={"endpoint": "/api/v1/pob/stats/offshore"},
                widget_config={"title": "Personnel offshore", "icon": "Users"},
            ),
            DashboardSystemWidget(
                id=uuid.uuid4(),
                dashboard_id=dash3.id,
                name="Certifications expirées",
                widget_type=WidgetTypeEnum.STATS_CARD,
                position_x=4, position_y=0, width=4, height=2,
                data_source_type=DataSourceTypeEnum.API,
                data_source_config={"endpoint": "/api/v1/pob/stats/certifications"},
                widget_config={"title": "Certifs expirées", "icon": "AlertCircle", "color": "red"},
            ),
            DashboardSystemWidget(
                id=uuid.uuid4(),
                dashboard_id=dash3.id,
                name="Répartition par site",
                widget_type=WidgetTypeEnum.PIE_CHART,
                position_x=8, position_y=0, width=4, height=4,
                data_source_type=DataSourceTypeEnum.API,
                data_source_config={"endpoint": "/api/v1/pob/stats/by-site"},
                widget_config={"title": "Répartition par site"},
            ),
            DashboardSystemWidget(
                id=uuid.uuid4(),
                dashboard_id=dash3.id,
                name="Alertes certifications",
                widget_type=WidgetTypeEnum.TABLE,
                position_x=0, position_y=2, width=8, height=4,
                data_source_type=DataSourceTypeEnum.API,
                data_source_config={"endpoint": "/api/v1/pob/certifications/expiring"},
                widget_config={"title": "Alertes certifications"},
            ),
        ]
        for w in widgets3:
            session.add(w)

        # Dashboard 4: Suivi Projets
        dash4 = Dashboard(
            id=uuid.uuid4(),
            name="Suivi Projets",
            description="Vue consolidée de l'avancement des projets",
            menu_parent=MenuParentEnum.PROJECTS,
            menu_label="Suivi Projets",
            menu_icon="FolderKanban",
            menu_order=1,
            show_in_sidebar=True,
            is_public=True,
            created_at=now,
            updated_at=now,
        )
        session.add(dash4)
        session.flush()

        widgets4 = [
            DashboardSystemWidget(
                id=uuid.uuid4(),
                dashboard_id=dash4.id,
                name="Projets en cours",
                widget_type=WidgetTypeEnum.STATS_CARD,
                position_x=0, position_y=0, width=3, height=2,
                data_source_type=DataSourceTypeEnum.API,
                data_source_config={"endpoint": "/api/v1/projects/stats"},
                widget_config={"title": "Projets en cours", "icon": "FolderKanban"},
            ),
            DashboardSystemWidget(
                id=uuid.uuid4(),
                dashboard_id=dash4.id,
                name="Tâches en retard",
                widget_type=WidgetTypeEnum.STATS_CARD,
                position_x=3, position_y=0, width=3, height=2,
                data_source_type=DataSourceTypeEnum.API,
                data_source_config={"endpoint": "/api/v1/projects/tasks/overdue"},
                widget_config={"title": "Tâches en retard", "icon": "Clock", "color": "red"},
            ),
            DashboardSystemWidget(
                id=uuid.uuid4(),
                dashboard_id=dash4.id,
                name="Avancement projets",
                widget_type=WidgetTypeEnum.BAR_CHART,
                position_x=0, position_y=2, width=6, height=4,
                data_source_type=DataSourceTypeEnum.API,
                data_source_config={"endpoint": "/api/v1/projects/progress"},
                widget_config={"title": "Avancement projets"},
            ),
            DashboardSystemWidget(
                id=uuid.uuid4(),
                dashboard_id=dash4.id,
                name="Activités récentes",
                widget_type=WidgetTypeEnum.LIST,
                position_x=6, position_y=0, width=6, height=6,
                data_source_type=DataSourceTypeEnum.API,
                data_source_config={"endpoint": "/api/v1/projects/activity"},
                widget_config={"title": "Activités récentes"},
            ),
        ]
        for w in widgets4:
            session.add(w)

        # Dashboard 5: Tiers & Contacts
        dash5 = Dashboard(
            id=uuid.uuid4(),
            name="Annuaire Tiers",
            description="Gestion des entreprises et contacts",
            menu_parent=MenuParentEnum.TIERS,
            menu_label="Annuaire",
            menu_icon="Building",
            menu_order=1,
            show_in_sidebar=True,
            is_public=True,
            created_at=now,
            updated_at=now,
        )
        session.add(dash5)
        session.flush()

        widgets5 = [
            DashboardSystemWidget(
                id=uuid.uuid4(),
                dashboard_id=dash5.id,
                name="Total entreprises",
                widget_type=WidgetTypeEnum.STATS_CARD,
                position_x=0, position_y=0, width=4, height=2,
                data_source_type=DataSourceTypeEnum.API,
                data_source_config={"endpoint": "/api/v1/third-parties/stats"},
                widget_config={"title": "Entreprises", "icon": "Building"},
            ),
            DashboardSystemWidget(
                id=uuid.uuid4(),
                dashboard_id=dash5.id,
                name="Total contacts",
                widget_type=WidgetTypeEnum.STATS_CARD,
                position_x=4, position_y=0, width=4, height=2,
                data_source_type=DataSourceTypeEnum.API,
                data_source_config={"endpoint": "/api/v1/third-parties/contacts/stats"},
                widget_config={"title": "Contacts", "icon": "Users"},
            ),
            DashboardSystemWidget(
                id=uuid.uuid4(),
                dashboard_id=dash5.id,
                name="Derniers ajouts",
                widget_type=WidgetTypeEnum.TABLE,
                position_x=0, position_y=2, width=12, height=5,
                data_source_type=DataSourceTypeEnum.API,
                data_source_config={"endpoint": "/api/v1/third-parties/companies?limit=10"},
                widget_config={"title": "Dernières entreprises"},
            ),
        ]
        for w in widgets5:
            session.add(w)

        session.commit()
        print(f"✓ Created 5 dashboards with widgets")


if __name__ == "__main__":
    seed_dashboards()
