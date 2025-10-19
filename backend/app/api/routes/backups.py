"""
Routes API pour le système de Backup et Restore.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlmodel import select, func

from app.api.deps import CurrentUser, SessionDep
from app.core.rbac import require_permission
from app.models_backup import (
    Backup,
    BackupCreate,
    BackupPublic,
    BackupsPublic,
    BackupRestore,
)
from app.core.backup_service import backup_service


router = APIRouter(prefix="/backups", tags=["backups"])


@router.get("/", response_model=BackupsPublic)
@require_permission("core.backups.read")
async def get_backups(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Récupère la liste des backups.

    Requiert la permission: core.backups.read
    """
    # Compte total
    count_statement = select(func.count()).select_from(Backup)
    count = session.exec(count_statement).one()

    # Récupère les backups avec pagination
    statement = select(Backup).offset(skip).limit(limit).order_by(Backup.created_at.desc())
    backups = session.exec(statement).all()

    return BackupsPublic(data=backups, count=count)


@router.get("/{backup_id}", response_model=BackupPublic)
@require_permission("core.backups.read")
async def get_backup(
    backup_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Récupère un backup par son ID.

    Requiert la permission: core.backups.read
    """
    backup = session.get(Backup, backup_id)
    if not backup:
        raise HTTPException(status_code=404, detail="Backup not found")

    return backup


async def create_backup_task(
    backup_id: UUID,
    backup_data: BackupCreate,
    session: SessionDep,
):
    """
    Tâche asynchrone pour créer un backup.
    """
    import logging
    logger = logging.getLogger(__name__)

    backup = session.get(Backup, backup_id)
    if not backup:
        logger.error(f"Backup {backup_id} not found")
        return

    try:
        # Mettre à jour le statut à "in_progress"
        backup.status = "in_progress"
        session.add(backup)
        session.commit()

        # Créer le backup
        success, file_path, stats = backup_service.create_backup(
            backup_id=backup_id,
            includes_database=backup_data.includes_database,
            includes_storage=backup_data.includes_storage,
            includes_config=backup_data.includes_config,
            db_session=session,
        )

        if success and file_path and stats:
            backup.status = "completed"
            backup.file_path = file_path
            backup.file_size = backup_service.get_backup_file_size(backup_id)
            backup.database_size = stats.get("database_size", 0)
            backup.storage_size = stats.get("storage_size", 0)
            backup.config_size = stats.get("config_size", 0)
            backup.completed_at = datetime.utcnow()
        else:
            backup.status = "failed"
            backup.error_message = "Backup creation failed"

        session.add(backup)
        session.commit()

        logger.info(f"Backup {backup_id} completed with status: {backup.status}")

    except Exception as e:
        logger.error(f"Backup {backup_id} failed: {e}")
        backup.status = "failed"
        backup.error_message = str(e)
        session.add(backup)
        session.commit()


@router.post("/", response_model=BackupPublic)
@require_permission("core.backups.create")
async def create_backup(
    backup_data: BackupCreate,
    session: SessionDep,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
) -> Any:
    """
    Crée un nouveau backup.

    Le backup est créé de manière asynchrone.

    Requiert la permission: core.backups.create
    """
    # Créer l'entrée dans la base de données
    backup = Backup(
        name=backup_data.name,
        description=backup_data.description,
        backup_type=backup_data.backup_type,
        status="pending",
        created_by_id=current_user.id,
        includes_database=backup_data.includes_database,
        includes_storage=backup_data.includes_storage,
        includes_config=backup_data.includes_config,
    )

    session.add(backup)
    session.commit()
    session.refresh(backup)

    # Lancer la tâche de backup en arrière-plan
    background_tasks.add_task(
        create_backup_task,
        backup.id,
        backup_data,
        session,
    )

    return backup


@router.get("/{backup_id}/download")
@require_permission("core.backups.download")
async def download_backup(
    backup_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> FileResponse:
    """
    Télécharge un fichier de backup.

    Requiert la permission: core.backups.download
    """
    backup = session.get(Backup, backup_id)
    if not backup:
        raise HTTPException(status_code=404, detail="Backup not found")

    if backup.status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Backup is not completed (status: {backup.status})"
        )

    if not backup.file_path:
        raise HTTPException(status_code=404, detail="Backup file not found")

    return FileResponse(
        path=backup.file_path,
        filename=f"{backup.name}.tar.gz",
        media_type="application/gzip",
    )


async def restore_backup_task(
    backup_id: UUID,
    restore_data: BackupRestore,
    session: SessionDep,
):
    """
    Tâche asynchrone pour restaurer un backup.
    """
    import logging
    logger = logging.getLogger(__name__)

    try:
        success, error_message = backup_service.restore_backup(
            backup_id=backup_id,
            restore_database=restore_data.restore_database,
            restore_storage=restore_data.restore_storage,
            restore_config=restore_data.restore_config,
            db_session=session,
        )

        if success:
            logger.info(f"Backup {backup_id} restored successfully")
        else:
            logger.error(f"Backup {backup_id} restore failed: {error_message}")

    except Exception as e:
        logger.error(f"Backup {backup_id} restore failed: {e}")


@router.post("/{backup_id}/restore")
@require_permission("core.backups.restore")
async def restore_backup(
    backup_id: UUID,
    restore_data: BackupRestore,
    session: SessionDep,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
) -> Any:
    """
    Restaure un backup.

    La restauration est effectuée de manière asynchrone.

    **ATTENTION**: Cette opération va écraser les données existantes.

    Requiert la permission: core.backups.restore
    """
    backup = session.get(Backup, backup_id)
    if not backup:
        raise HTTPException(status_code=404, detail="Backup not found")

    if backup.status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot restore incomplete backup (status: {backup.status})"
        )

    # Lancer la tâche de restauration en arrière-plan
    background_tasks.add_task(
        restore_backup_task,
        backup_id,
        restore_data,
        session,
    )

    return {
        "success": True,
        "message": "Restore started in background",
        "backup_id": str(backup_id),
    }


@router.delete("/{backup_id}")
@require_permission("core.backups.delete")
async def delete_backup(
    backup_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Supprime un backup.

    Requiert la permission: core.backups.delete
    """
    backup = session.get(Backup, backup_id)
    if not backup:
        raise HTTPException(status_code=404, detail="Backup not found")

    # Supprimer le fichier de backup
    if backup.file_path:
        success = backup_service.delete_backup(backup_id)
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to delete backup file"
            )

    # Supprimer l'entrée de la base de données
    session.delete(backup)
    session.commit()

    return {"success": True, "message": "Backup deleted"}


@router.post("/estimate")
@require_permission("core.backups.read")
async def estimate_backup_size(
    backup_data: BackupCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Estime la taille d'un backup avant de le créer.

    Calcule également l'espace disque disponible et vérifie s'il y a assez d'espace.

    Requiert la permission: core.backups.read
    """
    try:
        # Estimer la taille du backup
        estimated_size = backup_service.estimate_backup_size(
            includes_database=backup_data.includes_database,
            includes_storage=backup_data.includes_storage,
            includes_config=backup_data.includes_config,
        )

        # Récupérer l'espace disque disponible
        disk_space = backup_service.get_disk_space()

        # Vérifier s'il y a assez d'espace (avec marge de 10%)
        required_space = estimated_size * 1.1
        has_enough_space = disk_space["available"] >= required_space

        return {
            "estimated_size": estimated_size,
            "estimated_size_formatted": _format_bytes(estimated_size),
            "disk_space": {
                "total": disk_space["total"],
                "used": disk_space["used"],
                "available": disk_space["available"],
                "total_formatted": _format_bytes(disk_space["total"]),
                "used_formatted": _format_bytes(disk_space["used"]),
                "available_formatted": _format_bytes(disk_space["available"]),
                "percent_used": disk_space["percent"],
            },
            "has_enough_space": has_enough_space,
            "required_space": required_space,
            "required_space_formatted": _format_bytes(required_space),
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to estimate backup size: {str(e)}"
        )


@router.get("/disk-space")
@require_permission("core.backups.read")
async def get_disk_space(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Récupère les informations sur l'espace disque disponible.

    Requiert la permission: core.backups.read
    """
    try:
        disk_space = backup_service.get_disk_space()

        return {
            "total": disk_space["total"],
            "used": disk_space["used"],
            "available": disk_space["available"],
            "total_formatted": _format_bytes(disk_space["total"]),
            "used_formatted": _format_bytes(disk_space["used"]),
            "available_formatted": _format_bytes(disk_space["available"]),
            "percent_used": disk_space["percent"],
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get disk space: {str(e)}"
        )


def _format_bytes(bytes_value: int) -> str:
    """Formate les octets en format lisible"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_value < 1024.0:
            return f"{bytes_value:.2f} {unit}"
        bytes_value /= 1024.0
    return f"{bytes_value:.2f} PB"
