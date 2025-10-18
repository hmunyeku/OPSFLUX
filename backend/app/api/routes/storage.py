"""
Routes API pour le File Storage Service.
"""

from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse

from app.api.deps import CurrentUser, get_current_active_superuser
from app.core.storage_service import storage_service, FileCategory
from app.models import User
from io import BytesIO


router = APIRouter(prefix="/storage", tags=["storage"])


@router.post("/upload")
async def upload_file(
    current_user: CurrentUser,
    file: UploadFile = File(...),
    module: str = Query(..., description="Module propriétaire du fichier"),
    category: Optional[FileCategory] = Query(None, description="Catégorie du fichier"),
    generate_thumbnail: bool = Query(True, description="Générer un thumbnail pour les images"),
) -> Any:
    """
    Upload un fichier.

    Le fichier sera validé (type, taille) et stocké de manière organisée.
    """
    try:
        file_info = await storage_service.upload(
            file=file,
            module=module,
            category=category,
            user_id=str(current_user.id),
            generate_thumbnail=generate_thumbnail,
        )

        return {
            "success": True,
            "file": file_info.to_dict(),
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/files/{path:path}")
async def download_file(
    path: str,
    current_user: CurrentUser,
) -> StreamingResponse:
    """
    Télécharge un fichier.

    Args:
        path: Chemin du fichier (ex: "hse/images/2025/01/uuid.jpg")
    """
    content = await storage_service.download(path)

    if content is None:
        raise HTTPException(status_code=404, detail="File not found")

    # Déterminer le type MIME
    import mimetypes
    mime_type = mimetypes.guess_type(path)[0] or "application/octet-stream"

    # Retourner le fichier
    return StreamingResponse(
        BytesIO(content),
        media_type=mime_type,
        headers={
            "Content-Disposition": f'inline; filename="{path.split("/")[-1]}"'
        }
    )


@router.delete("/files/{path:path}")
async def delete_file(
    path: str,
    current_user: CurrentUser,
) -> Any:
    """
    Supprime un fichier.

    Args:
        path: Chemin du fichier
    """
    success = await storage_service.delete(path)

    if not success:
        raise HTTPException(status_code=404, detail="File not found")

    return {"success": True, "message": "File deleted"}


@router.get("/files/{path:path}/info")
async def get_file_info(
    path: str,
    current_user: CurrentUser,
) -> Any:
    """
    Récupère les informations d'un fichier.

    Args:
        path: Chemin du fichier
    """
    info = await storage_service.get_info(path)

    if info is None:
        raise HTTPException(status_code=404, detail="File not found")

    return info


@router.get("/list")
async def list_files(
    current_user: CurrentUser,
    module: Optional[str] = Query(None, description="Filtrer par module"),
    category: Optional[FileCategory] = Query(None, description="Filtrer par catégorie"),
) -> Any:
    """
    Liste les fichiers avec filtres optionnels.

    Args:
        module: Filtrer par module
        category: Filtrer par catégorie
    """
    files = await storage_service.list_files(
        module=module,
        category=category,
        user_id=str(current_user.id) if not current_user.is_superuser else None
    )

    return {
        "files": files,
        "count": len(files),
    }


@router.get("/stats")
async def get_storage_stats(
    current_user: CurrentUser,
    _: User = Depends(get_current_active_superuser),
) -> Any:
    """
    Récupère les statistiques de stockage.

    Requiert les privilèges superuser.
    """
    # TODO: Implémenter stats (taille totale, par module, etc.)
    return {
        "total_files": 0,
        "total_size_mb": 0,
        "by_module": {},
        "by_category": {},
    }
