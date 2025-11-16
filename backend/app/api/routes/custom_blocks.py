"""
Routes API REST pour les blocs personnalisés.
Permet aux admins de créer et configurer des blocs réutilisables.
"""

from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select, func

from app.api.deps import CurrentUser, SessionDep
from app.models import Message
from app.models_redacteur import (
    CustomBlock,
    CustomBlockCreate,
    CustomBlockPublic,
    CustomBlocksPublic,
    CustomBlockUpdate,
)

router = APIRouter(prefix="/redacteur/custom-blocks", tags=["redacteur"])


@router.get("/", response_model=CustomBlocksPublic)
def list_custom_blocks(
    session: SessionDep,
    current_user: CurrentUser,
    block_type: Optional[str] = Query(None, description="Filter by block type"),
    category: Optional[str] = Query(None, description="Filter by category"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> Any:
    """
    Récupère la liste des blocs personnalisés.
    """
    statement = select(CustomBlock)

    # Apply filters
    if block_type:
        statement = statement.where(CustomBlock.block_type == block_type)
    if category:
        statement = statement.where(CustomBlock.category == category)
    if is_active is not None:
        statement = statement.where(CustomBlock.is_active == is_active)

    # Get total count
    count_statement = select(func.count()).select_from(statement.subquery())
    total_count = session.exec(count_statement).one()

    # Apply pagination and ordering
    statement = statement.order_by(CustomBlock.name).offset(skip).limit(limit)

    blocks = session.exec(statement).all()

    return CustomBlocksPublic(data=blocks, count=total_count)


@router.get("/{block_id}", response_model=CustomBlockPublic)
def get_custom_block(
    session: SessionDep,
    current_user: CurrentUser,
    block_id: UUID,
) -> Any:
    """
    Récupère un bloc personnalisé par son ID.
    """
    block = session.get(CustomBlock, block_id)

    if not block:
        raise HTTPException(status_code=404, detail="Bloc personnalisé non trouvé")

    return block


@router.get("/name/{block_name}", response_model=CustomBlockPublic)
def get_custom_block_by_name(
    session: SessionDep,
    current_user: CurrentUser,
    block_name: str,
) -> Any:
    """
    Récupère un bloc personnalisé par son nom.
    """
    block = session.exec(
        select(CustomBlock).where(CustomBlock.name == block_name)
    ).first()

    if not block:
        raise HTTPException(status_code=404, detail="Bloc personnalisé non trouvé")

    return block


@router.post("/", response_model=CustomBlockPublic)
def create_custom_block(
    session: SessionDep,
    current_user: CurrentUser,
    block_in: CustomBlockCreate,
) -> Any:
    """
    Crée un nouveau bloc personnalisé.
    Réservé aux administrateurs de contenu.
    """
    # TODO: Add permission check for content admin role

    # Check if name already exists
    existing = session.exec(
        select(CustomBlock).where(CustomBlock.name == block_in.name)
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Un bloc avec ce nom existe déjà",
        )

    # Validate block_type
    valid_types = [
        "dataFetch",
        "chart",
        "formula",
        "signature",
        "reference",
        "variable",
        "comment",
        "custom",
    ]
    if block_in.block_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Type de bloc invalide. Types acceptés: {', '.join(valid_types)}",
        )

    block = CustomBlock(
        **block_in.model_dump(),
        created_by=current_user.id,
        updated_by=current_user.id,
    )

    session.add(block)
    session.commit()
    session.refresh(block)

    return block


@router.put("/{block_id}", response_model=CustomBlockPublic)
def update_custom_block(
    session: SessionDep,
    current_user: CurrentUser,
    block_id: UUID,
    block_in: CustomBlockUpdate,
) -> Any:
    """
    Met à jour un bloc personnalisé.
    Réservé aux administrateurs de contenu.
    """
    block = session.get(CustomBlock, block_id)

    if not block:
        raise HTTPException(status_code=404, detail="Bloc personnalisé non trouvé")

    # TODO: Add permission check

    # Update fields
    update_data = block_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            setattr(block, field, value)

    block.updated_by = current_user.id

    session.add(block)
    session.commit()
    session.refresh(block)

    return block


@router.delete("/{block_id}", response_model=Message)
def delete_custom_block(
    session: SessionDep,
    current_user: CurrentUser,
    block_id: UUID,
) -> Any:
    """
    Supprime un bloc personnalisé.
    Réservé aux administrateurs système.
    """
    block = session.get(CustomBlock, block_id)

    if not block:
        raise HTTPException(status_code=404, detail="Bloc personnalisé non trouvé")

    # TODO: Add permission check for system admin

    # TODO: Check if block is used in reports (would require scanning report content)

    session.delete(block)
    session.commit()

    return Message(message="Bloc personnalisé supprimé avec succès")


@router.patch("/{block_id}/toggle", response_model=CustomBlockPublic)
def toggle_block_status(
    session: SessionDep,
    current_user: CurrentUser,
    block_id: UUID,
) -> Any:
    """
    Active ou désactive un bloc personnalisé.
    """
    block = session.get(CustomBlock, block_id)

    if not block:
        raise HTTPException(status_code=404, detail="Bloc personnalisé non trouvé")

    # TODO: Add permission check

    block.is_active = not block.is_active
    block.updated_by = current_user.id

    session.add(block)
    session.commit()
    session.refresh(block)

    return block


@router.get("/types/available", response_model=dict[str, Any])
def get_available_block_types(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Retourne la liste des types de blocs disponibles avec leurs descriptions.
    """
    return {
        "types": [
            {
                "type": "dataFetch",
                "name": "Données Dynamiques",
                "description": "Récupère et affiche des données depuis une API ou base de données",
                "icon": "database",
                "category": "data",
                "config_schema": {
                    "source": {"type": "select", "values": ["api", "database"]},
                    "endpoint": {"type": "string"},
                    "displayAs": {
                        "type": "select",
                        "values": ["table", "cards", "list", "raw"],
                    },
                },
            },
            {
                "type": "chart",
                "name": "Graphique",
                "description": "Affiche des données sous forme de graphiques",
                "icon": "bar-chart-3",
                "category": "data",
                "config_schema": {
                    "chartType": {
                        "type": "select",
                        "values": ["line", "bar", "pie", "area"],
                    },
                    "dataSource": {"type": "select", "values": ["manual", "api"]},
                },
            },
            {
                "type": "formula",
                "name": "Formule",
                "description": "Calculs dynamiques avec formules mathématiques",
                "icon": "calculator",
                "category": "data",
                "config_schema": {
                    "formula": {"type": "string"},
                    "outputFormat": {
                        "type": "select",
                        "values": ["number", "currency", "percentage"],
                    },
                },
            },
            {
                "type": "signature",
                "name": "Signature",
                "description": "Bloc de signature électronique",
                "icon": "pen-tool",
                "category": "interactive",
                "config_schema": {
                    "signatory": {"type": "string"},
                    "role": {"type": "string"},
                    "required": {"type": "boolean"},
                },
            },
            {
                "type": "reference",
                "name": "Référence",
                "description": "Référence vers un autre document ou section",
                "icon": "link-2",
                "category": "layout",
                "config_schema": {
                    "referenceType": {
                        "type": "select",
                        "values": ["report", "document", "section", "external"],
                    },
                    "displayMode": {
                        "type": "select",
                        "values": ["link", "card", "embed"],
                    },
                },
            },
            {
                "type": "variable",
                "name": "Variable",
                "description": "Variables dynamiques (date, auteur, etc.)",
                "icon": "braces",
                "category": "data",
                "config_schema": {
                    "variableType": {
                        "type": "select",
                        "values": [
                            "current_date",
                            "author_name",
                            "document_version",
                            "custom",
                        ],
                    },
                },
            },
            {
                "type": "comment",
                "name": "Commentaire",
                "description": "Commentaires attachés au texte",
                "icon": "message-square",
                "category": "interactive",
                "config_schema": {},
            },
            {
                "type": "custom",
                "name": "Personnalisé",
                "description": "Bloc personnalisé configurable",
                "icon": "box",
                "category": "custom",
                "config_schema": {},
            },
        ],
        "categories": [
            {"name": "data", "label": "Données", "icon": "database"},
            {"name": "interactive", "label": "Interactif", "icon": "pointer"},
            {"name": "layout", "label": "Mise en page", "icon": "layout"},
            {"name": "custom", "label": "Personnalisé", "icon": "box"},
        ],
    }
