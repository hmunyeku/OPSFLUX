"""
API endpoints for database query execution and monitoring.
Allows authorized users to execute read-only SQL queries and view database information.
"""

import re
import os
import subprocess
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import text
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.api.deps import CurrentUser, SessionDep
from app.core.rbac import require_permission
from app.core.config import settings
from app.core.security import create_access_token

router = APIRouter(prefix="/database", tags=["database"])


class QueryRequest(BaseModel):
    """SQL query request model"""
    query: str


class QueryResponse(BaseModel):
    """SQL query response model"""
    rows: list[dict[str, Any]]
    row_count: int
    columns: list[str]


class DatabaseTableInfo(BaseModel):
    """Database table information model"""
    table_schema: str
    name: str
    size: str
    row_count: int


class TablesResponse(BaseModel):
    """Database tables list response model"""
    tables: list[DatabaseTableInfo]
    count: int


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


class AdminerTokenResponse(BaseModel):
    """Adminer token response model"""
    token: str
    expires_at: str
    adminer_url: str


class AdminerCredentialsResponse(BaseModel):
    """Adminer database credentials response model"""
    server: str
    username: str
    password: str
    database: str


class BackupInfo(BaseModel):
    """Database backup information model"""
    filename: str
    size: str
    created_at: str
    database_name: str


class BackupCreateRequest(BaseModel):
    """Database backup creation request model"""
    include_schema: bool = True
    include_data: bool = True
    description: Optional[str] = None


@router.get("/tables", response_model=TablesResponse)
@require_permission("database:execute_query")
def list_tables(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    List all tables in the database with details.

    Security:
    - Requires 'database:execute_query' permission
    - Returns table information from public schema
    """
    try:
        # Query to get table details from public schema (PostgreSQL)
        query = text("""
            SELECT
                schemaname as schema,
                tablename as name,
                pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
                COALESCE((
                    SELECT reltuples::bigint
                    FROM pg_class
                    WHERE oid = (schemaname||'.'||tablename)::regclass
                ), 0) as row_count
            FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY tablename
        """)

        result = session.execute(query)
        tables = []

        for row in result:
            tables.append(DatabaseTableInfo(
                table_schema=row[0],
                name=row[1],
                size=row[2] or "0 bytes",
                row_count=int(row[3]) if row[3] is not None else 0
            ))

        return TablesResponse(tables=tables, count=len(tables))
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
    - Lists all backup files from the backups directory
    """
    try:
        # Create backups directory if it doesn't exist
        backups_dir = Path("/var/backups/postgres")
        backups_dir.mkdir(parents=True, exist_ok=True)

        backups = []

        # List all .sql files in the backups directory
        for backup_file in backups_dir.glob("*.sql"):
            stat = backup_file.stat()
            backups.append(BackupInfo(
                filename=backup_file.name,
                size=f"{stat.st_size / (1024 * 1024):.2f} MB",
                created_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                database_name=settings.POSTGRES_DB
            ))

        # Sort by creation date (newest first)
        backups.sort(key=lambda x: x.created_at, reverse=True)

        return {
            "backups": backups,
            "count": len(backups)
        }
    except Exception as e:
        print(f"Error listing backups for user {current_user.email}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la récupération des sauvegardes: {str(e)}"
        )


@router.post("/backups", response_model=BackupInfo)
@require_permission("database:execute_query")
def create_backup(
    request: BackupCreateRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Create a new database backup using pg_dump.

    Security:
    - Requires 'database:execute_query' permission
    - Creates backup file in secure directory
    - Uses pg_dump for safe backup creation
    """
    try:
        # Create backups directory if it doesn't exist
        backups_dir = Path("/var/backups/postgres")
        backups_dir.mkdir(parents=True, exist_ok=True)

        # Generate backup filename with timestamp
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        description_suffix = f"_{request.description.replace(' ', '_')}" if request.description else ""
        filename = f"backup_{settings.POSTGRES_DB}_{timestamp}{description_suffix}.sql"
        backup_path = backups_dir / filename

        # Build pg_dump command
        pg_dump_cmd = [
            "pg_dump",
            "-h", settings.POSTGRES_SERVER,
            "-p", str(settings.POSTGRES_PORT),
            "-U", settings.POSTGRES_USER,
            "-d", settings.POSTGRES_DB,
            "-F", "p",  # Plain text format
            "-f", str(backup_path)
        ]

        # Add options based on request
        if request.include_schema and not request.include_data:
            pg_dump_cmd.append("--schema-only")
        elif request.include_data and not request.include_schema:
            pg_dump_cmd.append("--data-only")
        # If both are True (default), include everything (no flag needed)

        # Set environment variable for password
        env = os.environ.copy()
        env["PGPASSWORD"] = settings.POSTGRES_PASSWORD

        # Execute pg_dump
        result = subprocess.run(
            pg_dump_cmd,
            env=env,
            capture_output=True,
            text=True,
            timeout=300  # 5 minutes timeout
        )

        if result.returncode != 0:
            raise Exception(f"pg_dump failed: {result.stderr}")

        # Get file stats
        stat = backup_path.stat()

        return BackupInfo(
            filename=filename,
            size=f"{stat.st_size / (1024 * 1024):.2f} MB",
            created_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            database_name=settings.POSTGRES_DB
        )

    except subprocess.TimeoutExpired:
        print(f"Backup creation timed out for user {current_user.email}")
        raise HTTPException(
            status_code=500,
            detail="La création de la sauvegarde a dépassé le délai d'attente"
        )
    except Exception as e:
        print(f"Error creating backup for user {current_user.email}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la création de la sauvegarde: {str(e)}"
        )


@router.post("/adminer-token", response_model=AdminerTokenResponse)
@require_permission("database:execute_query")
def create_adminer_token(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Create a temporary token for accessing Adminer.

    Security:
    - Requires 'database:execute_query' permission
    - Token expires after 1 hour
    - Token includes user ID for authentication
    """
    try:
        # Create a short-lived token (1 hour) for Adminer access
        expires_delta = timedelta(hours=1)
        token = create_access_token(
            subject=str(current_user.id),
            expires_delta=expires_delta
        )

        # Calculate expiration time
        expires_at = datetime.now(timezone.utc) + expires_delta

        # Include only the token in URL for auto-login (credentials will be fetched via API)
        adminer_url_with_token = f"{settings.ADMINER_URL}/?token={token}"

        return AdminerTokenResponse(
            token=token,
            expires_at=expires_at.isoformat(),
            adminer_url=adminer_url_with_token
        )
    except Exception as e:
        print(f"Error creating Adminer token for user {current_user.email}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la création du token Adminer: {str(e)}"
        )


@router.get("/adminer-credentials", response_model=AdminerCredentialsResponse)
@require_permission("database:execute_query")
def get_adminer_credentials(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get database credentials for Adminer auto-login.

    Security:
    - Requires 'database:execute_query' permission
    - Only returns credentials if user is authenticated
    - Used by Adminer plugin for auto-login
    """
    try:
        return AdminerCredentialsResponse(
            server=settings.POSTGRES_SERVER,
            username=settings.POSTGRES_USER,
            password=settings.POSTGRES_PASSWORD,
            database=settings.POSTGRES_DB
        )
    except Exception as e:
        print(f"Error getting Adminer credentials for user {current_user.email}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la récupération des credentials: {str(e)}"
        )


@router.get("/backups/{filename}")
@require_permission("database:execute_query")
def download_backup(
    filename: str,
    session: SessionDep,
    current_user: CurrentUser,
) -> FileResponse:
    """
    Download a database backup file.

    Security:
    - Requires 'database:execute_query' permission
    - Validates filename to prevent path traversal attacks
    - Only allows downloading .sql files from backup directory
    """
    try:
        # Validate filename (prevent path traversal)
        if ".." in filename or "/" in filename or "\\" in filename:
            raise HTTPException(
                status_code=400,
                detail="Nom de fichier invalide"
            )

        # Only allow .sql files
        if not filename.endswith(".sql"):
            raise HTTPException(
                status_code=400,
                detail="Seuls les fichiers .sql peuvent être téléchargés"
            )

        # Get backup file path
        backups_dir = Path("/var/backups/postgres")
        backup_path = backups_dir / filename

        # Check if file exists
        if not backup_path.exists() or not backup_path.is_file():
            raise HTTPException(
                status_code=404,
                detail="Fichier de sauvegarde introuvable"
            )

        # Return file for download
        return FileResponse(
            path=str(backup_path),
            filename=filename,
            media_type="application/sql"
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error downloading backup for user {current_user.email}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors du téléchargement de la sauvegarde: {str(e)}"
        )


@router.delete("/backups/{filename}")
@require_permission("database:execute_query")
def delete_backup(
    filename: str,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Delete a database backup file.

    Security:
    - Requires 'database:execute_query' permission
    - Validates filename to prevent path traversal attacks
    - Only allows deleting .sql files from backup directory
    """
    try:
        # Validate filename (prevent path traversal)
        if ".." in filename or "/" in filename or "\\" in filename:
            raise HTTPException(
                status_code=400,
                detail="Nom de fichier invalide"
            )

        # Only allow .sql files
        if not filename.endswith(".sql"):
            raise HTTPException(
                status_code=400,
                detail="Seuls les fichiers .sql peuvent être supprimés"
            )

        # Get backup file path
        backups_dir = Path("/var/backups/postgres")
        backup_path = backups_dir / filename

        # Check if file exists
        if not backup_path.exists() or not backup_path.is_file():
            raise HTTPException(
                status_code=404,
                detail="Fichier de sauvegarde introuvable"
            )

        # Delete the file
        backup_path.unlink()

        return {
            "message": "Sauvegarde supprimée avec succès",
            "filename": filename
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting backup for user {current_user.email}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la suppression de la sauvegarde: {str(e)}"
        )
