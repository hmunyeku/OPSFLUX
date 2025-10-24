"""
Routes API pour la gestion de la base de données.
"""

import os
import secrets
import subprocess
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse, FileResponse
from pydantic import BaseModel
from sqlmodel import Session, text

from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.core.config import settings
from app.core.rbac import require_permission
from app.models import User


router = APIRouter(prefix="/database", tags=["database"])

# Directory to store backups
BACKUP_DIR = Path("/app/backups")
BACKUP_DIR.mkdir(parents=True, exist_ok=True)


class DatabaseInfo(BaseModel):
    """Database information model"""
    database_name: str
    server_host: str
    server_port: int
    total_tables: int
    database_size: str
    total_connections: int
    active_connections: int
    last_backup: str | None
    postgres_version: str


class AdminerToken(BaseModel):
    """Adminer temporary token model"""
    token: str
    expires_at: datetime
    adminer_url: str


@router.get("/info", response_model=DatabaseInfo)
@require_permission("core.database.read")
async def get_database_info(
    current_user: CurrentUser,
    session: SessionDep,
) -> Any:
    """
    Récupère les informations sur la base de données.

    Requiert la permission: core.database.read
    """
    try:
        # Récupérer les informations de base
        db_name_query = text("SELECT current_database()")
        db_name_row = session.exec(db_name_query).first()
        db_name = db_name_row[0] if db_name_row else "unknown"

        # Nombre de tables
        tables_query = text("""
            SELECT COUNT(*)
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        """)
        total_tables_row = session.exec(tables_query).first()
        total_tables = int(total_tables_row[0]) if total_tables_row else 0

        # Taille de la base de données
        size_query = text("SELECT pg_size_pretty(pg_database_size(current_database()))")
        db_size_row = session.exec(size_query).first()
        db_size = db_size_row[0] if db_size_row else "0 bytes"

        # Connexions
        connections_query = text("""
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE state = 'active') as active
            FROM pg_stat_activity
            WHERE datname = current_database()
        """)
        conn_result = session.exec(connections_query).first()

        # Version PostgreSQL
        version_query = text("SELECT version() as version")
        version_row = session.exec(version_query).first()
        version = version_row[0].split(',')[0] if version_row and version_row[0] else "Unknown"

        return DatabaseInfo(
            database_name=db_name,
            server_host=settings.POSTGRES_SERVER,
            server_port=settings.POSTGRES_PORT,
            total_tables=total_tables,
            database_size=db_size,
            total_connections=int(conn_result[0]) if conn_result else 0,
            active_connections=int(conn_result[1]) if conn_result else 0,
            last_backup=None,  # TODO: Implémenter la récupération de la dernière sauvegarde
            postgres_version=version,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve database information: {str(e)}"
        )


@router.post("/adminer-token", response_model=AdminerToken)
@require_permission("core.database.admin")
async def create_adminer_token(
    current_user: CurrentUser,
    session: SessionDep,
) -> Any:
    """
    Crée un token temporaire pour accéder à Adminer sans authentification.

    Le token expire après 30 minutes.
    Requiert la permission: core.database.admin
    """
    try:
        # Générer un token unique
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)

        # Stocker le token en Redis avec le user_id et les credentials DB
        from app.core.cache_service import cache_service
        from sqlmodel import select
        from app.models_preferences import UserPreference
        from app.models import User

        # Récupérer l'utilisateur complet depuis la DB
        user_stmt = select(User).where(User.id == current_user.id)
        full_user = session.exec(user_stmt).first()

        # Récupérer les préférences utilisateur (langue et thème)
        user_lang = getattr(full_user, 'default_language', 'fr') or "fr"

        # Récupérer la préférence de thème (theme preference dans user_preferences)
        user_theme = "dark"  # Default
        try:
            theme_pref_stmt = select(UserPreference).where(
                UserPreference.user_id == current_user.id,
                UserPreference.preference_key == "theme",
                UserPreference.module_id.is_(None)
            )
            theme_pref = session.exec(theme_pref_stmt).first()
            if theme_pref and theme_pref.preference_value:
                user_theme = theme_pref.preference_value.get("value", "dark")
        except Exception as e:
            # Si erreur de récupération du thème, utiliser dark par défaut
            print(f"Warning: Could not retrieve theme preference: {e}")
            user_theme = "dark"
    except Exception as e:
        print(f"Error in create_adminer_token: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

    token_key = f"adminer_token:{token}"
    token_data = {
        "user_id": str(current_user.id),
        "username": current_user.email,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "db_server": settings.POSTGRES_SERVER,
        "db_port": settings.POSTGRES_PORT,
        "db_name": settings.POSTGRES_DB,
        "db_user": settings.POSTGRES_USER,
        "db_password": settings.POSTGRES_PASSWORD,
        "language": user_lang,
        "theme": user_theme,
    }

    await cache_service.set(
        key=token_key,
        value=token_data,
        ttl=1800,  # 30 minutes
        namespace="adminer"
    )

    # URL vers notre endpoint de redirection
    # Déterminer l'URL du backend à partir de ADMINER_URL
    backend_url = settings.ADMINER_URL.replace("adminer.", "api.").rstrip("/")
    adminer_url = f"{backend_url}/api/v1/database/adminer-auth/{token}"

    return AdminerToken(
        token=token,
        expires_at=expires_at,
        adminer_url=adminer_url,
    )


@router.get("/adminer-auth/{token}")
async def adminer_auth_redirect(token: str) -> HTMLResponse:
    """
    Vérifie le token et retourne une page HTML qui se connecte automatiquement à Adminer.
    """
    from app.core.cache_service import cache_service

    # Récupérer les données du token depuis Redis
    token_key = f"adminer_token:{token}"
    token_data = await cache_service.get(key=token_key, namespace="adminer")

    if not token_data:
        raise HTTPException(
            status_code=404,
            detail="Token invalide ou expiré"
        )

    # Supprimer le token après utilisation (usage unique)
    await cache_service.delete(key=token_key, namespace="adminer")

    # Créer une page HTML qui soumet automatiquement le formulaire de connexion Adminer
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Connexion à Adminer...</title>
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: hsl(0 0% 100%);
            }}
            .container {{
                text-align: center;
            }}
            p {{
                color: hsl(0 0% 45%);
                font-size: 14px;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <p>Connexion à Adminer...</p>
        </div>
        <form id="adminer-form" method="POST" action="{settings.ADMINER_URL}">
            <input type="hidden" name="auth[driver]" value="pgsql">
            <input type="hidden" name="auth[server]" value="{token_data['db_server']}:{token_data['db_port']}">
            <input type="hidden" name="auth[username]" value="{token_data['db_user']}">
            <input type="hidden" name="auth[password]" value="{token_data['db_password']}">
            <input type="hidden" name="auth[db]" value="{token_data['db_name']}">
            <input type="hidden" name="opsflux_lang" value="{token_data['language']}">
            <input type="hidden" name="opsflux_theme" value="{token_data['theme']}">
            <input type="hidden" name="opsflux_restrict_db" value="{token_data['db_name']}">
        </form>
        <script>
            // Soumettre automatiquement le formulaire immédiatement
            document.getElementById('adminer-form').submit();
        </script>
    </body>
    </html>
    """

    return HTMLResponse(content=html_content)


@router.get("/tables")
@require_permission("core.database.read")
async def get_database_tables(
    current_user: CurrentUser,
    session: SessionDep,
) -> Any:
    """
    Liste toutes les tables de la base de données avec leurs informations.

    Requiert la permission: core.database.read
    """
    try:
        query = text("""
            SELECT
                schemaname,
                relname,
                pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) as size,
                n_live_tup as row_count
            FROM pg_stat_user_tables
            ORDER BY pg_total_relation_size(schemaname||'.'||relname) DESC
        """)

        result = session.exec(query).all()

        tables = []
        for row in result:
            tables.append({
                "schema": row[0],
                "name": row[1],
                "size": row[2],
                "row_count": row[3],
            })

        return {
            "tables": tables,
            "count": len(tables)
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve tables: {str(e)}"
        )


@router.get("/recent-activity")
@require_permission("core.database.read")
async def get_recent_activity(
    current_user: CurrentUser,
    session: SessionDep,
    limit: int = 10,
) -> Any:
    """
    Récupère les dernières activités sur la base de données.

    Requiert la permission: core.database.read
    """
    try:
        query = text("""
            SELECT
                pid,
                usename,
                application_name,
                client_addr,
                state,
                query,
                state_change
            FROM pg_stat_activity
            WHERE datname = current_database()
                AND pid != pg_backend_pid()
            ORDER BY state_change DESC
            LIMIT :limit
        """)

        result = session.exec(query, params={"limit": limit}).all()

        activities = []
        for row in result:
            activities.append({
                "pid": row[0],
                "user": row[1],
                "application": row[2],
                "client_address": str(row[3]) if row[3] else None,
                "state": row[4],
                "query": row[5][:100] + "..." if row[5] and len(row[5]) > 100 else row[5],
                "timestamp": row[6].isoformat() if row[6] else None,
            })

        return {
            "activities": activities,
            "count": len(activities)
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve activity: {str(e)}"
        )


class BackupInfo(BaseModel):
    """Database backup information model"""
    filename: str
    size: str
    created_at: str
    database_name: str


class BackupCreateRequest(BaseModel):
    """Request model for creating a backup"""
    include_schema: bool = True
    include_data: bool = True
    description: str | None = None


@router.get("/backups")
@require_permission("core.database.backup")
async def list_backups(
    current_user: CurrentUser,
    session: SessionDep,
) -> Any:
    """
    Liste toutes les sauvegardes disponibles.

    Requiert la permission: core.database.backup
    """
    try:
        backups = []

        if BACKUP_DIR.exists():
            for backup_file in BACKUP_DIR.glob("*.sql"):
                stat = backup_file.stat()
                size = stat.st_size

                # Format size
                if size < 1024:
                    size_str = f"{size} B"
                elif size < 1024 * 1024:
                    size_str = f"{size / 1024:.2f} KB"
                elif size < 1024 * 1024 * 1024:
                    size_str = f"{size / (1024 * 1024):.2f} MB"
                else:
                    size_str = f"{size / (1024 * 1024 * 1024):.2f} GB"

                # Get database name from filename (format: dbname_YYYYMMDD_HHMMSS.sql)
                parts = backup_file.stem.split("_")
                db_name = parts[0] if parts else "unknown"

                backups.append(BackupInfo(
                    filename=backup_file.name,
                    size=size_str,
                    created_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                    database_name=db_name
                ))

        # Sort by creation date (newest first)
        backups.sort(key=lambda x: x.created_at, reverse=True)

        return {
            "backups": backups,
            "count": len(backups)
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list backups: {str(e)}"
        )


@router.post("/backups")
@require_permission("core.database.backup")
async def create_backup(
    current_user: CurrentUser,
    session: SessionDep,
    request: BackupCreateRequest | None = None,
) -> Any:
    """
    Crée une nouvelle sauvegarde de la base de données.

    Requiert la permission: core.database.backup
    """
    try:
        # Generate filename with timestamp
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"{settings.POSTGRES_DB}_{timestamp}.sql"
        backup_path = BACKUP_DIR / filename

        # Build pg_dump command
        env = os.environ.copy()
        env["PGPASSWORD"] = settings.POSTGRES_PASSWORD

        cmd = [
            "pg_dump",
            "-h", settings.POSTGRES_SERVER,
            "-p", str(settings.POSTGRES_PORT),
            "-U", settings.POSTGRES_USER,
            "-d", settings.POSTGRES_DB,
            "-F", "p",  # Plain text format
            "-f", str(backup_path),
        ]

        if request:
            if not request.include_schema:
                cmd.append("--data-only")
            elif not request.include_data:
                cmd.append("--schema-only")

        # Execute pg_dump
        result = subprocess.run(
            cmd,
            env=env,
            capture_output=True,
            text=True,
            timeout=300  # 5 minutes timeout
        )

        if result.returncode != 0:
            raise Exception(f"pg_dump failed: {result.stderr}")

        # Get file size
        stat = backup_path.stat()
        size = stat.st_size

        if size < 1024:
            size_str = f"{size} B"
        elif size < 1024 * 1024:
            size_str = f"{size / 1024:.2f} KB"
        elif size < 1024 * 1024 * 1024:
            size_str = f"{size / (1024 * 1024):.2f} MB"
        else:
            size_str = f"{size / (1024 * 1024 * 1024):.2f} GB"

        return BackupInfo(
            filename=filename,
            size=size_str,
            created_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            database_name=settings.POSTGRES_DB
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=500,
            detail="Backup creation timeout (exceeded 5 minutes)"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create backup: {str(e)}"
        )


@router.get("/backups/{filename}")
@require_permission("core.database.backup")
async def download_backup(
    filename: str,
    current_user: CurrentUser,
    session: SessionDep,
) -> FileResponse:
    """
    Télécharge un fichier de sauvegarde.

    Requiert la permission: core.database.backup
    """
    try:
        backup_path = BACKUP_DIR / filename

        if not backup_path.exists():
            raise HTTPException(
                status_code=404,
                detail="Backup file not found"
            )

        # Security check: ensure the file is within BACKUP_DIR
        if not str(backup_path.resolve()).startswith(str(BACKUP_DIR.resolve())):
            raise HTTPException(
                status_code=403,
                detail="Access denied"
            )

        return FileResponse(
            path=str(backup_path),
            filename=filename,
            media_type="application/sql"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to download backup: {str(e)}"
        )


@router.delete("/backups/{filename}")
@require_permission("core.database.backup")
async def delete_backup(
    filename: str,
    current_user: CurrentUser,
    session: SessionDep,
) -> Any:
    """
    Supprime un fichier de sauvegarde.

    Requiert la permission: core.database.backup
    """
    try:
        backup_path = BACKUP_DIR / filename

        if not backup_path.exists():
            raise HTTPException(
                status_code=404,
                detail="Backup file not found"
            )

        # Security check: ensure the file is within BACKUP_DIR
        if not str(backup_path.resolve()).startswith(str(BACKUP_DIR.resolve())):
            raise HTTPException(
                status_code=403,
                detail="Access denied"
            )

        backup_path.unlink()

        return {"message": "Backup deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete backup: {str(e)}"
        )
