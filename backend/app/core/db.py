from sqlmodel import Session, create_engine, select
from sqlalchemy import event
import time

from app import crud
from app.core.config import settings
from app.models import User, UserCreate
from app.models_rbac import Role

# Configuration du pool de connexions pour supporter Celery et le backend
engine = create_engine(
    str(settings.SQLALCHEMY_DATABASE_URI),
    pool_size=20,  # Augmenté de 5 à 20 pour supporter les workers Celery
    max_overflow=40,  # Augmenté de 10 à 40 pour les pics de charge
    pool_pre_ping=True,  # Vérifie la connexion avant utilisation
    pool_recycle=3600,  # Recycle les connexions après 1h
)


# ==============================
# DATABASE QUERY METRICS TRACKING
# ==============================

# Stocker le temps de début de chaque query
_query_start_times = {}


@event.listens_for(engine, "before_cursor_execute")
def receive_before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """
    Event listener appelé AVANT chaque query SQL.
    On stocke le timestamp de début pour mesurer la durée.
    """
    conn_id = id(conn)
    _query_start_times[conn_id] = time.time()


@event.listens_for(engine, "after_cursor_execute")
def receive_after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """
    Event listener appelé APRÈS chaque query SQL.
    On mesure la durée et on enregistre la métrique.
    """
    from app.core.metrics_service import metrics_service

    conn_id = id(conn)
    start_time = _query_start_times.pop(conn_id, None)

    if start_time:
        duration = time.time() - start_time

        # Extraire le type d'opération (SELECT, INSERT, UPDATE, DELETE)
        operation = statement.strip().split()[0].upper() if statement else "UNKNOWN"

        # Extraire le nom de la table (simplifié)
        table = _extract_table_name(statement)

        # Enregistrer la métrique
        metrics_service.observe(
            "db_query_duration_seconds",
            duration,
            labels={"table": table, "operation": operation}
        )


def _extract_table_name(statement: str) -> str:
    """
    Extrait le nom de la table depuis une query SQL.

    Exemples:
        SELECT * FROM users WHERE ... -> users
        INSERT INTO companies ... -> companies
        UPDATE dashboards SET ... -> dashboards
    """
    if not statement:
        return "unknown"

    statement_upper = statement.upper()

    # SELECT ... FROM table
    if "FROM" in statement_upper:
        parts = statement_upper.split("FROM")[1].strip().split()
        if parts:
            return parts[0].lower().strip('`"[]')

    # INSERT INTO table
    elif "INSERT INTO" in statement_upper:
        parts = statement_upper.split("INSERT INTO")[1].strip().split()
        if parts:
            return parts[0].lower().strip('`"[]')

    # UPDATE table
    elif "UPDATE" in statement_upper:
        parts = statement_upper.split("UPDATE")[1].strip().split()
        if parts:
            return parts[0].lower().strip('`"[]')

    # DELETE FROM table
    elif "DELETE FROM" in statement_upper:
        parts = statement_upper.split("DELETE FROM")[1].strip().split()
        if parts:
            return parts[0].lower().strip('`"[]')

    return "unknown"


# make sure all SQLModel models are imported (app.models) before initializing DB
# otherwise, SQLModel might fail to initialize relationships properly
# for more details: https://github.com/fastapi/full-stack-fastapi-template/issues/28


def init_db(session: Session) -> None:
    # Tables should be created with Alembic migrations
    # But if you don't want to use migrations, create
    # the tables un-commenting the next lines
    # from sqlmodel import SQLModel

    # This works because the models are already imported and registered from app.models
    # SQLModel.metadata.create_all(engine)

    user = session.exec(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).first()
    if not user:
        user_in = UserCreate(
            email=settings.FIRST_SUPERUSER,
            password=settings.FIRST_SUPERUSER_PASSWORD,
            is_superuser=True,
        )
        user = crud.create_user(session=session, user_create=user_in)

        # Assigner automatiquement le rôle admin au superuser
        admin_role = session.exec(select(Role).where(Role.code == "admin")).first()
        if admin_role and user:
            user.roles.append(admin_role)
            session.add(user)
            session.commit()
            session.refresh(user)
