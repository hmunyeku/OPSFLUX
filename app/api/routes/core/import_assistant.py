"""Import assistant API — universal Excel/CSV import with saved mappings."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, has_user_permission
from app.core.database import get_db
from app.models.common import ImportMapping, User
from app.schemas.import_assistant import (
    AutoDetectRequest,
    AutoDetectResponse,
    ImportExecuteRequest,
    ImportExecuteResponse,
    ImportMappingCreate,
    ImportMappingRead,
    ImportMappingUpdate,
    ImportPreviewRequest,
    ImportPreviewResponse,
    TargetObjectInfo,
)
from app.services.modules.import_service import (
    auto_detect_mapping,
    execute_import,
    get_target_objects,
    validate_import,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/import", tags=["import"])

# Permission mapping: target_object -> required permission
_PERMISSION_MAP: dict[str, str] = {
    "asset": "asset.create",
    "tier": "tier.create",
    "contact": "tier.create",
    "pax_profile": "paxlog.ads.create",
    "project": "project.create",
    "compliance_record": "conformite.create",
}


# ── Target metadata ───────────────────────────────────────────────────────


@router.get("/targets", response_model=list[TargetObjectInfo])
async def list_import_targets(
    current_user: User = Depends(get_current_user),
):
    """Return all importable target objects and their field definitions."""
    return get_target_objects()


# ── Available transforms ──────────────────────────────────────────────


@router.get("/transforms")
async def list_available_transforms(
    current_user: User = Depends(get_current_user),
):
    """Return available transform types with descriptions."""
    return [
        # -- Original transforms --
        {"type": "uppercase", "label": "Majuscules", "description": "Convertit en majuscules", "params": []},
        {"type": "lowercase", "label": "Minuscules", "description": "Convertit en minuscules", "params": []},
        {"type": "trim", "label": "Nettoyer espaces", "description": "Supprime les espaces en début/fin", "params": []},
        {"type": "trim_all", "label": "Nettoyer tous les espaces", "description": "Supprime les espaces en début/fin et les doubles espaces internes", "params": []},
        {"type": "default_value", "label": "Valeur par défaut", "description": "Remplace les cellules vides", "params": [{"name": "default", "type": "string", "label": "Valeur"}]},
        {"type": "map_values", "label": "Table de correspondance", "description": "Remplace les valeurs selon une table", "params": [{"name": "mapping", "type": "object", "label": "Correspondances (clé → valeur)"}]},
        {"type": "concat", "label": "Concaténer", "description": "Combine plusieurs colonnes", "params": [{"name": "sources", "type": "string[]", "label": "Colonnes sources"}, {"name": "separator", "type": "string", "label": "Séparateur", "default": " "}]},
        {"type": "prefix", "label": "Préfixe", "description": "Ajoute un préfixe", "params": [{"name": "prefix", "type": "string", "label": "Préfixe"}]},
        {"type": "suffix", "label": "Suffixe", "description": "Ajoute un suffixe", "params": [{"name": "suffix", "type": "string", "label": "Suffixe"}]},
        {"type": "replace", "label": "Rechercher/Remplacer", "description": "Remplace du texte", "params": [{"name": "find", "type": "string", "label": "Rechercher"}, {"name": "replace", "type": "string", "label": "Remplacer par"}]},
        {"type": "flag_to_boolean", "label": "Flag → Booléen", "description": "Convertit X/Oui/1 en true", "params": [{"name": "true_values", "type": "string[]", "label": "Valeurs vraies", "default": ["X", "1", "Oui"]}]},
        {"type": "deduplicate_key", "label": "Clé de dédoublonnage", "description": "Groupe les lignes par cette colonne", "params": []},
        {"type": "split", "label": "Découper", "description": "Extrait une partie d'une valeur séparée", "params": [{"name": "separator", "type": "string", "label": "Séparateur"}, {"name": "index", "type": "number", "label": "Position (0=premier)"}]},
        # -- Normalisation avancée --
        {"type": "normalize_country", "label": "Normaliser pays", "description": "Convertit noms/codes pays en ISO 3166-1 alpha-2 (FR, CM, US…)", "params": []},
        {"type": "normalize_phone", "label": "Normaliser téléphone", "description": "Nettoie le numéro et applique l'indicatif pays par défaut", "params": [{"name": "default_country_code", "type": "string", "label": "Indicatif par défaut", "default": "+237"}]},
        {"type": "normalize_incoterm", "label": "Normaliser Incoterm", "description": "Convertit les variations d'Incoterms en codes standard (EXW, FOB, CIF…)", "params": []},
        {"type": "normalize_date", "label": "Normaliser date", "description": "Convertit différents formats de date en ISO YYYY-MM-DD", "params": [{"name": "format", "type": "string", "label": "Format source", "default": "auto", "options": ["auto", "dd/mm/yyyy", "mm/dd/yyyy"]}]},
        {"type": "normalize_datetime", "label": "Normaliser date/heure", "description": "Convertit différents formats date/heure en ISO 8601", "params": [{"name": "format", "type": "string", "label": "Format source", "default": "auto", "options": ["auto", "dd/mm/yyyy", "mm/dd/yyyy"]}]},
        # -- Extraction de texte --
        {"type": "left", "label": "Extraire gauche", "description": "Extrait les N premiers caractères", "params": [{"name": "count", "type": "number", "label": "Nombre de caractères"}]},
        {"type": "right", "label": "Extraire droite", "description": "Extrait les N derniers caractères", "params": [{"name": "count", "type": "number", "label": "Nombre de caractères"}]},
        {"type": "mid", "label": "Extraire milieu", "description": "Extrait une sous-chaîne à partir d'une position", "params": [{"name": "start", "type": "number", "label": "Position de début (0=premier)"}, {"name": "length", "type": "number", "label": "Longueur"}]},
        {"type": "between", "label": "Extraire entre délimiteurs", "description": "Extrait le texte entre deux délimiteurs", "params": [{"name": "start", "type": "string", "label": "Délimiteur début"}, {"name": "end", "type": "string", "label": "Délimiteur fin"}]},
    ]


# ── Auto-detect ───────────────────────────────────────────────────────────


@router.post("/auto-detect", response_model=AutoDetectResponse)
async def detect_mapping(
    body: AutoDetectRequest,
    current_user: User = Depends(get_current_user),
):
    """Suggest column mappings by fuzzy-matching file headers to target fields."""
    mapping, confidence = auto_detect_mapping(body.target_object, body.file_headers)
    return AutoDetectResponse(suggested_mapping=mapping, confidence=confidence)


# ── Validate / Preview ────────────────────────────────────────────────────


@router.post("/validate", response_model=ImportPreviewResponse)
async def validate_import_data(
    body: ImportPreviewRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Validate rows without importing. Returns per-row errors/warnings."""
    result = await validate_import(
        target_object=body.target_object,
        column_mapping=body.column_mapping,
        rows=body.rows,
        duplicate_strategy=body.duplicate_strategy,
        entity_id=entity_id,
        db=db,
        transforms=body.transforms,
    )
    return ImportPreviewResponse(**result)


# ── Execute import ────────────────────────────────────────────────────────


@router.post("/execute", response_model=ImportExecuteResponse)
async def execute_import_data(
    body: ImportExecuteRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Execute the import with permission check based on target_object."""
    perm = _PERMISSION_MAP.get(body.target_object)
    if perm and not await has_user_permission(current_user, entity_id, perm, db):
        raise HTTPException(status_code=403, detail=f"Permission denied: {perm}")

    result = await execute_import(
        target_object=body.target_object,
        column_mapping=body.column_mapping,
        rows=body.rows,
        duplicate_strategy=body.duplicate_strategy,
        entity_id=entity_id,
        user_id=current_user.id,
        db=db,
        transforms=body.transforms,
        max_rows=body.max_rows,
    )

    # Update mapping usage stats if mapping_id provided
    if body.mapping_id:
        await db.execute(
            update(ImportMapping)
            .where(ImportMapping.id == body.mapping_id)
            .values(last_used_at=datetime.now(UTC), use_count=ImportMapping.use_count + 1)
        )
        await db.commit()

    return ImportExecuteResponse(**result)


# ── Saved Mappings CRUD ───────────────────────────────────────────────────


@router.get("/mappings", response_model=list[ImportMappingRead])
async def list_mappings(
    target_object: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List saved column mappings for this entity."""
    stmt = (
        select(ImportMapping)
        .where(ImportMapping.entity_id == entity_id, ImportMapping.archived == False)
        .order_by(ImportMapping.last_used_at.desc().nullslast(), ImportMapping.created_at.desc())
    )
    if target_object:
        stmt = stmt.where(ImportMapping.target_object == target_object)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/mappings", response_model=ImportMappingRead, status_code=201)
async def create_mapping(
    body: ImportMappingCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save a column mapping for reuse."""
    obj = ImportMapping(
        entity_id=entity_id,
        name=body.name,
        description=body.description,
        target_object=body.target_object,
        column_mapping=body.column_mapping,
        transforms=body.transforms,
        file_headers=body.file_headers,
        file_settings=body.file_settings,
        created_by=current_user.id,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/mappings/{mapping_id}", response_model=ImportMappingRead)
async def update_mapping(
    mapping_id: UUID,
    body: ImportMappingUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a saved mapping."""
    result = await db.execute(
        select(ImportMapping).where(
            ImportMapping.id == mapping_id,
            ImportMapping.entity_id == entity_id,
            ImportMapping.archived == False,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Mapping not found")

    if body.name is not None:
        obj.name = body.name
    if body.description is not None:
        obj.description = body.description
    if body.column_mapping is not None:
        obj.column_mapping = body.column_mapping
    if body.transforms is not None:
        obj.transforms = body.transforms
    if body.file_headers is not None:
        obj.file_headers = body.file_headers
    if body.file_settings is not None:
        obj.file_settings = body.file_settings

    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/mappings/{mapping_id}", status_code=204)
async def delete_mapping(
    mapping_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a saved mapping."""
    result = await db.execute(
        select(ImportMapping).where(
            ImportMapping.id == mapping_id,
            ImportMapping.entity_id == entity_id,
            ImportMapping.archived == False,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Mapping not found")

    obj.archived = True
    await db.commit()
