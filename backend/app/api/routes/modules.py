"""
Routes API pour le système de gestion de modules.
"""

import uuid
from typing import Any
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, Response
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
    ModuleMenuItem,
    MenuItemPublic,
    ModuleMenuPublic,
    ModuleMenusResponse,
)
from app.services.module_service import ModuleManager
from app.core.hook_trigger_service import hook_trigger
from app.core.cache_service import cache_service


router = APIRouter(prefix="/modules", tags=["modules"])


@router.get("/", response_model=ModulesPublic)
@cache_service.cached(
    namespace="modules",
    key_builder=lambda session, current_user, skip, limit, status, category, search: f"list:{skip}:{limit}:{status}:{category}:{search}"
)
async def read_modules(
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
    Uses default TTL from settings (redis_default_ttl).

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
                display_order=module.display_order,
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


@router.get("/menus", response_model=ModuleMenusResponse)
@cache_service.cached(namespace="modules")
async def get_active_modules_menus(
    session: SessionDep,
    current_user: CurrentUser,
) -> ModuleMenusResponse:
    """
    Récupère les menus de tous les modules actifs.
    Uses default TTL from settings (redis_default_ttl).

    Retourne une structure adaptée pour injection dans la sidebar:
    [
        {
            "module_code": "hse",
            "module_name": "HSE Reports",
            "menu_items": [
                {
                    "label": "Dashboard HSE",
                    "route": "/hse/dashboard",
                    "icon": "LayoutDashboard",
                    "permission": "hse.view.dashboard",
                    "order": 101
                },
                ...
            ]
        },
        ...
    ]
    """
    # Récupérer tous les modules actifs
    statement = select(Module).where(
        Module.status == ModuleStatus.ACTIVE,
        Module.deleted_at == None  # noqa: E711
    ).order_by(Module.display_order, Module.name)
    active_modules = session.exec(statement).all()

    result = []

    for module in active_modules:
        # Récupérer les menu items de ce module
        menu_statement = select(ModuleMenuItem).where(
            ModuleMenuItem.module_id == module.id,
            ModuleMenuItem.is_active == True
        ).order_by(ModuleMenuItem.order)

        menu_items = session.exec(menu_statement).all()

        if menu_items:
            result.append(
                ModuleMenuPublic(
                    module_code=module.code,
                    module_name=module.name,
                    module_icon=module.icon,
                    module_color=module.color,
                    display_order=module.display_order,
                    menu_items=[
                        MenuItemPublic(
                            id=str(item.id),
                            label=item.label,
                            route=item.route,
                            icon=item.icon,
                            permission=item.permission_code,
                            order=item.order,
                            badge_source=item.badge_source,
                        )
                        for item in menu_items
                    ]
                )
            )

    return ModuleMenusResponse(data=result, count=len(result))


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

        # Trigger hook: module.installed
        try:
            await hook_trigger.trigger_event(
                event="module.installed",
                context={
                    "user_id": str(current_user.id),
                    "module_id": str(module.id),
                    "module_code": module.code,
                    "module_name": module.name,
                    "module_version": module.version,
                    "module_category": module.category,
                    "installed_by": str(current_user.id),
                    "has_backend": module.backend_path is not None,
                    "has_frontend": module.frontend_path is not None,
                },
                db=session,
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to trigger module.installed hook: {e}")

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
                display_order=module.display_order,
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

    print(f"DEBUG: Module {module.code} - manifest keys: {list(module.manifest.keys()) if module.manifest else 'None'}")

    result = ModulePublic(
        id=module.id,
        name=module.name,
        code=module.code,
        slug=module.slug,
        version=module.version,
        description=module.description,
        category=module.category,
        icon=module.icon,
        color=module.color,
        display_order=module.display_order,
        status=module.status,
        installed_at=module.installed_at,
        activated_at=module.activated_at,
        is_system=module.is_system,
        is_required=module.is_required,
        requires_license=module.requires_license,
        created_at=module.created_at,
        updated_at=module.updated_at,
        manifest=module.manifest,
    )

    print(f"DEBUG: Result manifest: {result.manifest is not None}")

    return result


@router.patch("/{module_id}", response_model=ModulePublic)
async def update_module(
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

    # Invalidate modules cache
    await cache_service.clear_namespace("modules")

    # Trigger hook: module.updated
    try:
        await hook_trigger.trigger_event(
            event="module.updated",
            context={
                "user_id": str(current_user.id),
                "module_id": str(module.id),
                "module_code": module.code,
                "module_name": module.name,
                "changes": update_data,
                "updated_by": str(current_user.id),
            },
            db=session,
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to trigger module.updated hook: {e}")

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
        display_order=module.display_order,
        status=module.status,
        installed_at=module.installed_at,
        activated_at=module.activated_at,
        is_system=module.is_system,
        is_required=module.is_required,
        requires_license=module.requires_license,
        created_at=module.created_at,
        updated_at=module.updated_at,
        manifest=module.manifest,
    )


@router.post("/{module_id}/activate", response_model=ModulePublic)
async def activate_module(
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

    # Invalidate modules cache
    await cache_service.clear_namespace("modules")

    # Trigger hot reload for the module
    from app.core.module_hot_reload import hot_reload_service
    hot_reload_service.reload_module(module.code)

    # Trigger hook: module.activated
    try:
        await hook_trigger.trigger_event(
            event="module.activated",
            context={
                "user_id": str(current_user.id),
                "module_id": str(module.id),
                "module_code": module.code,
                "module_name": module.name,
                "module_version": module.version,
                "activated_by": str(current_user.id),
            },
            db=session,
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to trigger module.activated hook: {e}")

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
        display_order=module.display_order,
        status=module.status,
        installed_at=module.installed_at,
        activated_at=module.activated_at,
        is_system=module.is_system,
        is_required=module.is_required,
        requires_license=module.requires_license,
        created_at=module.created_at,
        updated_at=module.updated_at,
        manifest=module.manifest,
    )


@router.post("/{module_id}/deactivate", response_model=ModulePublic)
async def deactivate_module(
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

    # Invalidate modules cache
    await cache_service.clear_namespace("modules")

    # Trigger hot reload for the module
    from app.core.module_hot_reload import hot_reload_service
    hot_reload_service.reload_module(module.code)

    # Trigger hook: module.deactivated
    try:
        await hook_trigger.trigger_event(
            event="module.deactivated",
            context={
                "user_id": str(current_user.id),
                "module_id": str(module.id),
                "module_code": module.code,
                "module_name": module.name,
                "deactivated_by": str(current_user.id),
            },
            db=session,
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to trigger module.deactivated hook: {e}")

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
        display_order=module.display_order,
        status=module.status,
        installed_at=module.installed_at,
        activated_at=module.activated_at,
        is_system=module.is_system,
        is_required=module.is_required,
        requires_license=module.requires_license,
        created_at=module.created_at,
        updated_at=module.updated_at,
        manifest=module.manifest,
    )


@router.delete("/{module_id}", response_model=Message)
async def uninstall_module(
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
    # Récupérer les infos du module avant suppression pour le hook
    module = session.get(Module, module_id)
    if module:
        module_context = {
            "module_id": str(module.id),
            "module_code": module.code,
            "module_name": module.name,
            "module_version": module.version,
            "module_category": module.category,
        }

    ModuleManager.uninstall_module(
        session=session,
        module_id=module_id,
        uninstalled_by=current_user
    )

    # Trigger hook: module.uninstalled
    if module:
        try:
            await hook_trigger.trigger_event(
                event="module.uninstalled",
                context={
                    "user_id": str(current_user.id),
                    "uninstalled_by": str(current_user.id),
                    **module_context,
                },
                db=session,
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to trigger module.uninstalled hook: {e}")

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


@router.post("/cleanup/duplicates")
async def cleanup_duplicate_resources(
    session: SessionDep,
    current_user: CurrentUser,
    _: User = Depends(get_current_active_superuser),
) -> Any:
    """
    Nettoie les ressources en doublon (hooks, permissions, menus) créées par
    les multiples activations/désactivations de modules.

    Garde la ressource la plus récente et supprime les anciennes.
    Vide également le cache Redis.

    Requiert les privilèges superuser.
    """
    from app.models_hooks import Hook

    cleaned_count = {
        "hooks": 0,
        "permissions": 0,
        "menus": 0,
    }

    # Nettoyer les hooks en doublon
    statement = select(Hook)
    all_hooks = session.exec(statement).all()

    hooks_by_key = {}
    for hook in all_hooks:
        key = (hook.event, hook.name)
        if key not in hooks_by_key:
            hooks_by_key[key] = []
        hooks_by_key[key].append(hook)

    for (event, name), hooks in hooks_by_key.items():
        if len(hooks) > 1:
            # Garder le plus récent
            hooks_sorted = sorted(hooks, key=lambda h: h.created_at, reverse=True)
            for hook in hooks_sorted[1:]:
                session.delete(hook)
                cleaned_count["hooks"] += 1

    session.commit()

    # Vider complètement le cache Redis
    await cache_service.clear_all()

    return {
        "success": True,
        "message": "Cleanup completed successfully",
        "cleaned": cleaned_count,
    }


@router.get("/{module_code}/frontend/module.config.js")
async def get_compiled_module(
    module_code: str,
    current_user: CurrentUser,
) -> Response:
    """
    Sert le module frontend compilé depuis /modules/[code]/frontend/compiled/module.config.js

    Ce endpoint permet au frontend de charger dynamiquement les modules sans les inclure
    dans le build. Les modules sont compilés par le backend lors de l'installation.
    """
    # Chemin vers le module compilé
    compiled_path = Path(f"/modules/{module_code}/frontend/compiled/module.config.js")

    if not compiled_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Compiled module {module_code} not found. The module may not have a frontend component or hasn't been compiled yet."
        )

    # Lire le contenu du fichier
    try:
        with open(compiled_path, 'r', encoding='utf-8') as f:
            content = f.read()

        return Response(
            content=content,
            media_type="application/javascript",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read compiled module: {str(e)}"
        )
