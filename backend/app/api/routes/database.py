"""
API endpoints for database query execution and monitoring.
Allows authorized users to execute read-only SQL queries and view database information.
"""

import re
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import text
from datetime import datetime

from app.api.deps import CurrentUser, SessionDep
from app.core.rbac import require_permission
from app.core.config import settings

router = APIRouter(prefix="/database", tags=["database"])


class QueryRequest(BaseModel):
    """SQL query request model"""
    query: str


class QueryResponse(BaseModel):
    """SQL query response model"""
    rows: list[dict[str, Any]]
    row_count: int
    columns: list[str]


class TablesResponse(BaseModel):
    """Database tables list response model"""
    tables: list[str]


class DatabaseInfo(BaseModel):
    """Database information model"""
    database_name: str
    server_host: str
    server_port: int
    total_tables: int
    database_size: str
    total_connections: int
    active_connections: int
    last_backup: Optional[str] = None
    postgres_version: str


class RecentActivity(BaseModel):
    """Database activity model"""
    pid: int
    user: str
    application: str
    client_address: Optional[str]
    state: str
    query: str
    timestamp: Optional[str]


class RecentActivityResponse(BaseModel):
    """Recent activity response model"""
    activities: list[RecentActivity]
    count: int


@router.get("/tables", response_model=TablesResponse)
@require_permission("database:execute_query")
def list_tables(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    List all tables in the database.

    Security:
    - Requires 'database:execute_query' permission
    - Returns only table names from public schema
    """
    try:
        # Query to get all tables from the public schema (PostgreSQL)
        query = text("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        """)

        result = session.execute(query)
        tables = [row[0] for row in result]

        return TablesResponse(tables=tables)
    except Exception as e:
        print(f"Error listing tables for user {current_user.email}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la récupération des tables: {str(e)}"
        )


@router.post("/query", response_model=QueryResponse)
@require_permission("database:execute_query")
def execute_query(
    request: QueryRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Execute a read-only SQL query.

    Security:
    - Only SELECT queries are allowed
    - Requires 'database:execute_query' permission
    - Query is sanitized to prevent dangerous operations
    """
    query = request.query.strip()

    # Validation basique: seules les requêtes SELECT sont autorisées
    query_upper = query.upper()

    # Enlever les espaces au début pour vérifier le premier mot
    query_stripped = query_upper.lstrip()

    # Vérifier que c'est bien une requête SELECT
    if not query_stripped.startswith("SELECT"):
        raise HTTPException(
            status_code=400,
            detail="Seules les requêtes SELECT sont autorisées"
        )

    # Vérifier qu'il n'y a pas de commandes dangereuses en tant que mots-clés SQL
    # On utilise une regex plus intelligente pour détecter les mots-clés SQL
    # et non pas juste leur présence dans la chaîne
    dangerous_keywords = [
        "DROP", "DELETE", "INSERT", "UPDATE", "ALTER", "CREATE",
        "TRUNCATE", "REPLACE", "GRANT", "REVOKE", "EXEC", "EXECUTE"
    ]

    for keyword in dangerous_keywords:
        # Chercher le mot-clé en tant que mot complet (word boundary)
        # Mais seulement en dehors des chaînes de caractères
        # Pattern: le mot-clé doit être précédé d'un espace, début de ligne, ou ;
        # et suivi d'un espace, fin de ligne, ou ;
        pattern = r"(?:^|[;\s])" + keyword + r"(?:[;\s]|$)"

        # On doit d'abord retirer les chaînes de caractères pour éviter les faux positifs
        # Remplacer temporairement les chaînes entre quotes par des espaces
        query_without_strings = re.sub(r"'[^']*'", " ", query_upper)
        query_without_strings = re.sub(r'"[^"]*"', " ", query_without_strings)

        if re.search(pattern, query_without_strings):
            raise HTTPException(
                status_code=400,
                detail=f"Commande non autorisée: {keyword}"
            )

    # Vérifier la présence de point-virgule multiples (tentative d'injection)
    if query.count(";") > 1:
        raise HTTPException(
            status_code=400,
            detail="Plusieurs commandes ne sont pas autorisées"
        )

    # Limiter la taille de la requête
    if len(query) > 10000:
        raise HTTPException(
            status_code=400,
            detail="Requête trop longue (max 10000 caractères)"
        )

    try:
        # Exécuter la requête en lecture seule
        result = session.execute(text(query))

        # Récupérer les résultats
        rows = []
        columns = list(result.keys()) if result.keys() else []

        for row in result:
            row_dict = {}
            for i, col in enumerate(columns):
                value = row[i]
                # Convertir les types non-JSON en string
                if value is not None:
                    if isinstance(value, (str, int, float, bool)):
                        row_dict[col] = value
                    else:
                        row_dict[col] = str(value)
                else:
                    row_dict[col] = None
            rows.append(row_dict)

        # Limiter le nombre de résultats pour éviter les surcharges
        max_rows = 1000
        if len(rows) > max_rows:
            rows = rows[:max_rows]

        return QueryResponse(
            rows=rows,
            row_count=len(rows),
            columns=columns
        )

    except Exception as e:
        # Log l'erreur pour debug
        print(f"SQL Query Error for user {current_user.email}: {str(e)}")

        raise HTTPException(
            status_code=400,
            detail=f"Erreur lors de l'exécution de la requête: {str(e)}"
        )


@router.get("/info", response_model=DatabaseInfo)
@require_permission("database:execute_query")
def get_database_info(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get database information and statistics.

    Security:
    - Requires 'database:execute_query' permission
    """
    try:
        # Get database name
        db_name_query = text("SELECT current_database()")
        db_name = session.execute(db_name_query).scalar()

        # Get PostgreSQL version
        version_query = text("SELECT version()")
        version = session.execute(version_query).scalar()

        # Get total tables count
        tables_query = text("""
            SELECT COUNT(*)
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
        """)
        total_tables = session.execute(tables_query).scalar()

        # Get database size
        size_query = text("SELECT pg_size_pretty(pg_database_size(current_database()))")
        db_size = session.execute(size_query).scalar()

        # Get connection stats
        connections_query = text("""
            SELECT
                (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as total,
                (SELECT count(*) FROM pg_stat_activity) as active
        """)
        conn_result = session.execute(connections_query).fetchone()

        return DatabaseInfo(
            database_name=db_name,
            server_host=settings.POSTGRES_SERVER,
            server_port=settings.POSTGRES_PORT,
            total_tables=total_tables or 0,
            database_size=db_size or "0 bytes",
            total_connections=conn_result[0] if conn_result else 0,
            active_connections=conn_result[1] if conn_result else 0,
            last_backup=None,  # TODO: Implement backup tracking
            postgres_version=version.split(",")[0] if version else "Unknown"
        )
    except Exception as e:
        print(f"Error getting database info for user {current_user.email}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la récupération des informations: {str(e)}"
        )


@router.get("/recent-activity", response_model=RecentActivityResponse)
@require_permission("database:execute_query")
def get_recent_activity(
    session: SessionDep,
    current_user: CurrentUser,
    limit: int = 10,
) -> Any:
    """
    Get recent database activity.

    Security:
    - Requires 'database:execute_query' permission
    - Limited to configured number of rows
    """
    try:
        # Limit to reasonable amount
        limit = min(limit, 100)

        query = text(f"""
            SELECT
                pid,
                usename as user,
                application_name as application,
                client_addr::text as client_address,
                state,
                query,
                state_change::text as timestamp
            FROM pg_stat_activity
            WHERE datname = current_database()
            AND pid != pg_backend_pid()
            ORDER BY state_change DESC
            LIMIT :limit
        """)

        result = session.execute(query, {"limit": limit})
        activities = []

        for row in result:
            activities.append(RecentActivity(
                pid=row[0],
                user=row[1],
                application=row[2] or "Unknown",
                client_address=row[3],
                state=row[4],
                query=row[5][:200] if row[5] else "",  # Truncate long queries
                timestamp=row[6]
            ))

        return RecentActivityResponse(
            activities=activities,
            count=len(activities)
        )
    except Exception as e:
        print(f"Error getting recent activity for user {current_user.email}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la récupération de l'activité: {str(e)}"
        )


@router.get("/backups")
@require_permission("database:execute_query")
def list_backups(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    List database backups.

    Security:
    - Requires 'database:execute_query' permission

    Note: This is a placeholder endpoint. Backup functionality should be
    implemented based on your backup strategy (pg_dump, continuous archiving, etc.)
    """
    # TODO: Implement actual backup listing
    # For now, return empty list
    return {
        "backups": [],
        "count": 0
    }
