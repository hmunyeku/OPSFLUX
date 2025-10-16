"""
Routes API pour le système de gestion de modules.
"""

import uuid
from typing import Any
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.models import Message, User
from app.models_modules import (
    Module,
    ModuleStatus,
    ModuleRegistry,
    ModulePublic,
    ModulesPublic,
    ModuleUpdate,
    ModuleInstallRequest,
    ModuleInstallResponse,
    ModuleRegistryPublic,
)
from app.services.module_service import ModuleManager


router = APIRouter(prefix="/modules", tags=["modules"])


@router.get("/", response_model=ModulesPublic)
def read_modules(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    status: ModuleStatus | None = None,
    category: str | None = None,
    search: str | None = None,
) -> Any:
    """
    Récupère la liste des modules installés.

    Filtres:
    - status: Filtrer par statut (active, installed, disabled, etc.)
    - category: Filtrer par catégorie (core, business, integration, etc.)
    - search: Recherche par nom ou description
    """
    # Base query
    statement = select(Module).where(Module.deleted_at == None)  # noqa: E711

    # Filtrer par statut
    if status:
        statement = statement.where(Module.status == status)

    # Filtrer par catégorie
    if category:
        statement = statement.where(Module.category == category)

    # Recherche textuelle
    if search:
        search_filter = f"%{search}%"
        statement = statement.where(
            (Module.name.ilike(search_filter)) |
            (Module.description.ilike(search_filter))
        )

    # Compter le total
    count_statement = select(func.count()).select_from(statement.subquery())
    count = session.exec(count_statement).one()

    # Récupérer avec pagination
    statement = (
        statement
        .order_by(Module.name)
        .offset(skip)
        .limit(limit)
    )
    modules = session.exec(statement).all()

    # Convertir vers modèle public
    public_modules = []
    for module in modules:
        public_modules.append(
            ModulePublic(
                id=module.id,
                name=module.name,
                code=module.code,
                slug=module.slug,
                version=module.version,
                description=module.description,
                category=module.category,
                icon=module.icon,
                color=module.color,
                status=module.status,
                installed_at=module.installed_at,
                activated_at=module.activated_at,
                is_system=module.is_system,
                is_required=module.is_required,
                requires_license=module.requires_license,
                created_at=module.created_at,
                updated_at=module.updated_at,
            )
        )

    return ModulesPublic(data=public_modules, count=count)


@router.get("/stats")
def get_modules_stats(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Récupère les statistiques sur les modules.
    """
    stats = ModuleManager.get_module_stats(session)
    return stats


@router.get("/discover")
def discover_modules(
    session: SessionDep,
    current_user: CurrentUser,
    _: User = Depends(get_current_active_superuser),
) -> Any:
    """
    Découvre les modules installés sur le système.
    Scanne le dossier modules/ et met à jour la base de données.

    Requiert les privilèges superuser.
    """
    discovered = ModuleManager.discover_modules(session)
    return {
        "discovered": len(discovered),
        "modules": [
            {"id": str(m.id), "name": m.name, "code": m.code, "version": m.version}
            for m in discovered
        ]
    }


@router.post("/install", response_model=ModuleInstallResponse)
async def install_module(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    file: UploadFile = File(...),
    _: User = Depends(get_current_active_superuser),
) -> Any:
    """
    Installe un module depuis un fichier ZIP uploadé.

    Le ZIP doit contenir:
    - manifest.json (requis)
    - backend/ (optionnel)
    - frontend/ (optionnel)
    - requirements.txt (optionnel)

    Requiert les privilèges superuser.
    """
    import tempfile
    import shutil

    # Vérifier le type de fichier
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="File must be a ZIP archive")

    # Sauvegarder le fichier temporairement
    temp_file = None
    try:
        # Créer un fichier temporaire
        with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as temp_file:
            # Copier le contenu
            shutil.copyfileobj(file.file, temp_file)
            temp_file_path = temp_file.name

        # Installer le module
        module = ModuleManager.install_module(
            session=session,
            zip_file_path=temp_file_path,
            installed_by=current_user
        )

        return ModuleInstallResponse(
            success=True,
            message=f"Module {module.name} installed successfully",
            module=ModulePublic(
                id=module.id,
                name=module.name,
                code=module.code,
                slug=module.slug,
                version=module.version,
                description=module.description,
                category=module.category,
                icon=module.icon,
                color=module.color,
                status=module.status,
                installed_at=module.installed_at,
                activated_at=module.activated_at,
                is_system=module.is_system,
                is_required=module.is_required,
                requires_license=module.requires_license,
                created_at=module.created_at,
                updated_at=module.updated_at,
            )
        )

    except HTTPException:
        raise
    except Exception as e:
        return ModuleInstallResponse(
            success=False,
            message=f"Installation failed: {str(e)}",
            errors=[str(e)]
        )
    finally:
        # Nettoyer le fichier temporaire
        if temp_file_path and Path(temp_file_path).exists():
            Path(temp_file_path).unlink()


@router.get("/{module_id}", response_model=ModulePublic)
def read_module(
    module_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Récupère un module spécifique par ID.
    """
    module = session.get(Module, module_id)
    if not module or module.deleted_at:
        raise HTTPException(status_code=404, detail="Module not found")

    return ModulePublic(
        id=module.id,
        name=module.name,
        code=module.code,
        slug=module.slug,
        version=module.version,
        description=module.description,
        category=module.category,
        icon=module.icon,
        color=module.color,
        status=module.status,
        installed_at=module.installed_at,
        activated_at=module.activated_at,
        is_system=module.is_system,
        is_required=module.is_required,
        requires_license=module.requires_license,
        created_at=module.created_at,
        updated_at=module.updated_at,
    )


@router.patch("/{module_id}", response_model=ModulePublic)
def update_module(
    *,
    module_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    module_in: ModuleUpdate,
    _: User = Depends(get_current_active_superuser),
) -> Any:
    """
    Met à jour un module.

    Requiert les privilèges superuser.
    """
    module = session.get(Module, module_id)
    if not module or module.deleted_at:
        raise HTTPException(status_code=404, detail="Module not found")

    # Mettre à jour uniquement les champs fournis
    update_data = module_in.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(module, key, value)

    module.updated_by_id = current_user.id

    session.add(module)
    session.commit()
    session.refresh(module)

    return ModulePublic(
        id=module.id,
        name=module.name,
        code=module.code,
        slug=module.slug,
        version=module.version,
        description=module.description,
        category=module.category,
        icon=module.icon,
        color=module.color,
        status=module.status,
        installed_at=module.installed_at,
        activated_at=module.activated_at,
        is_system=module.is_system,
        is_required=module.is_required,
        requires_license=module.requires_license,
        created_at=module.created_at,
        updated_at=module.updated_at,
    )


@router.post("/{module_id}/activate", response_model=ModulePublic)
def activate_module(
    module_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: User = Depends(get_current_active_superuser),
) -> Any:
    """
    Active un module installé.

    Requiert les privilèges superuser.
    """
    module = ModuleManager.activate_module(
        session=session,
        module_id=module_id,
        activated_by=current_user
    )

    return ModulePublic(
        id=module.id,
        name=module.name,
        code=module.code,
        slug=module.slug,
        version=module.version,
        description=module.description,
        category=module.category,
        icon=module.icon,
        color=module.color,
        status=module.status,
        installed_at=module.installed_at,
        activated_at=module.activated_at,
        is_system=module.is_system,
        is_required=module.is_required,
        requires_license=module.requires_license,
        created_at=module.created_at,
        updated_at=module.updated_at,
    )


@router.post("/{module_id}/deactivate", response_model=ModulePublic)
def deactivate_module(
    module_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: User = Depends(get_current_active_superuser),
) -> Any:
    """
    Désactive un module actif.

    Requiert les privilèges superuser.
    """
    module = ModuleManager.deactivate_module(
        session=session,
        module_id=module_id,
        deactivated_by=current_user
    )

    return ModulePublic(
        id=module.id,
        name=module.name,
        code=module.code,
        slug=module.slug,
        version=module.version,
        description=module.description,
        category=module.category,
        icon=module.icon,
        color=module.color,
        status=module.status,
        installed_at=module.installed_at,
        activated_at=module.activated_at,
        is_system=module.is_system,
        is_required=module.is_required,
        requires_license=module.requires_license,
        created_at=module.created_at,
        updated_at=module.updated_at,
    )


@router.delete("/{module_id}", response_model=Message)
def uninstall_module(
    module_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: User = Depends(get_current_active_superuser),
) -> Message:
    """
    Désinstalle un module.

    ATTENTION: Opération destructive!
    - Supprime les fichiers du module
    - Supprime les données en DB
    - Supprime les permissions, menus, hooks

    Requiert les privilèges superuser.
    """
    ModuleManager.uninstall_module(
        session=session,
        module_id=module_id,
        uninstalled_by=current_user
    )

    return Message(message="Module uninstalled successfully")


# --- Module Registry (Marketplace) ---

@router.get("/registry/list")
def list_registry_modules(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    category: str | None = None,
    featured: bool | None = None,
    search: str | None = None,
) -> Any:
    """
    Liste les modules disponibles dans le registry (marketplace).

    Filtres:
    - category: Filtrer par catégorie
    - featured: Afficher uniquement les modules mis en avant
    - search: Recherche textuelle
    """
    statement = select(ModuleRegistry).where(
        ModuleRegistry.deleted_at == None,  # noqa: E711
        ModuleRegistry.is_deprecated == False
    )

    if category:
        statement = statement.where(ModuleRegistry.category == category)

    if featured:
        statement = statement.where(ModuleRegistry.is_featured == True)

    if search:
        search_filter = f"%{search}%"
        statement = statement.where(
            (ModuleRegistry.name.ilike(search_filter)) |
            (ModuleRegistry.description.ilike(search_filter))
        )

    # Compter le total
    count_statement = select(func.count()).select_from(statement.subquery())
    count = session.exec(count_statement).one()

    # Récupérer avec pagination
    statement = (
        statement
        .order_by(ModuleRegistry.is_featured.desc(), ModuleRegistry.download_count.desc())
        .offset(skip)
        .limit(limit)
    )
    registry_modules = session.exec(statement).all()

    # Convertir vers modèle public
    public_modules = []
    for module in registry_modules:
        public_modules.append(
            ModuleRegistryPublic(
                id=module.id,
                code=module.code,
                name=module.name,
                version=module.version,
                description=module.description,
                author=module.author,
                category=module.category,
                icon=module.icon,
                download_url=module.download_url,
                download_count=module.download_count,
                rating=module.rating,
                install_count=module.install_count,
                is_featured=module.is_featured,
                is_verified=module.is_verified,
                published_at=module.published_at,
            )
        )

    return {"data": public_modules, "count": count}
