"""Import assistant service — generic import engine with per-target-object handlers.

Handles column auto-detection, row validation, duplicate detection,
and bulk create/update for all importable business objects.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from abc import ABC, abstractmethod
from datetime import datetime, date, UTC
from typing import Any
from uuid import UUID

try:
    from dateutil import parser as dateutil_parser
except ImportError:
    dateutil_parser = None  # type: ignore[assignment]

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.references import generate_reference
from app.models.asset_registry import (
    Installation,
    OilField,
    OilSite,
    RegistryEquipment,
    RegistryPipeline,
)
from app.models.common import (

    ComplianceRecord,
    ComplianceType,
    Project,
    Tier,
    TierContact,
)
from app.models.paxlog import PaxProfile
from app.schemas.import_assistant import (
    RowValidationError,
    TargetFieldDef,
    TargetObjectInfo,
)

logger = logging.getLogger(__name__)


# ── Helpers ────────────────────────────────────────────────────────────────


def _normalize(s: str) -> str:
    """Normalize a string for fuzzy matching: lowercase, strip accents, remove non-alnum."""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _safe_str(val: Any) -> str | None:
    if val is None or val == "":
        return None
    return str(val).strip()


def _safe_float(val: Any) -> float | None:
    if val is None or val == "":
        return None
    try:
        return float(str(val).replace(",", ".").replace(" ", ""))
    except (ValueError, TypeError):
        return None


def _safe_int(val: Any) -> int | None:
    if val is None or val == "":
        return None
    try:
        return int(float(str(val).replace(",", ".").replace(" ", "")))
    except (ValueError, TypeError):
        return None


def _safe_date(val: Any) -> date | None:
    if val is None or val == "":
        return None
    s = str(val).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%Y%m%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _safe_datetime(val: Any) -> datetime | None:
    if val is None or val == "":
        return None
    s = str(val).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    return None


def _safe_bool(val: Any) -> bool | None:
    if val is None or val == "":
        return None
    s = str(val).strip().lower()
    if s in ("1", "true", "oui", "yes", "o", "y", "vrai"):
        return True
    if s in ("0", "false", "non", "no", "n", "faux"):
        return False
    return None


# ── Field synonym dictionary (FR/EN) ──────────────────────────────────────

FIELD_SYNONYMS: dict[str, list[str]] = {
    # Common
    "code": ["reference", "ref", "identifiant", "id_code", "code_ref", "numero"],
    "name": ["nom", "designation", "libelle", "intitule", "raison_sociale", "title"],
    "description": ["desc", "details", "commentaire", "comment", "remarque", "notes"],
    "type": ["category", "categorie", "kind", "classe", "type_code"],
    "status": ["statut", "etat", "state"],
    "active": ["actif", "enabled", "is_active"],
    # Person
    "first_name": ["prenom", "firstname", "given_name", "first", "prenoms"],
    "last_name": ["nom", "surname", "family_name", "last", "nom_famille", "patronyme"],
    "civility": ["civilite", "titre", "title", "mr_mme"],
    "email": ["courriel", "e_mail", "mail", "adresse_email", "email_address"],
    "phone": ["telephone", "tel", "phone_number", "numero_tel", "mobile"],
    "position": ["poste", "job_title", "fonction", "job", "titre_poste"],
    "department": ["service", "departement", "direction", "dept"],
    # Company
    "alias": ["nom_commercial", "trade_name", "dba", "enseigne"],
    "website": ["site_web", "url", "site_internet", "web"],
    "legal_form": ["forme_juridique", "forme_legale", "legal_status"],
    "capital": ["capital_social", "share_capital"],
    "currency": ["devise", "monnaie"],
    "industry": ["secteur", "activite", "sector", "business"],
    "payment_terms": ["conditions_paiement", "payment", "delai_paiement"],
    # Installation
    "parent_code": ["code_parent", "parent", "parent_ref", "asset_parent"],
    "latitude": ["lat", "gps_lat"],
    "longitude": ["lng", "lon", "gps_lng", "gps_lon"],
    "max_pax": ["capacite_pax", "pax_capacity", "nb_pax_max"],
    "year_installed": ["annee_installation", "annee_instal", "install_year", "year_built"],
    "orientation": ["orient", "heading", "azimuth"],
    "water_depth": ["prof_eau", "profondeur_eau", "depth", "profondeur"],
    "altitude": ["elevation", "alt", "hauteur_sol"],
    "jacket_dimensions": ["dim_jacket", "jacket_size", "jacket"],
    "jacket_weight": ["poids_jacket", "jacket_mass"],
    "nb_piles": ["nb_pieux", "piles", "pieux", "nombre_pieux"],
    "pile_diameter": ["diam_pieux", "pile_diam", "diametre_pieux"],
    "deck_dimensions": ["dim_deck", "deck_size"],
    "deck_level": ["niv_deck", "nb_deck", "deck_levels"],
    "top_deck_load": ["charge_top_deck", "deck_load", "charge_deck"],
    "has_winj": ["winj", "water_injection", "injection_eau"],
    "has_power": ["power", "production_elec", "electricity"],
    "capacity": ["capacite", "cap", "charge_max", "lifting_capacity", "cap_grue"],
    "max_range": ["portee_max", "portee", "range", "reach"],
    "equipment_subtype": ["type_grue", "crane_type", "sous_type"],
    "manufacturer": ["fabricant", "constructeur", "maker", "brand"],
    "model_ref": ["modele", "model", "ref_modele"],
    "pipeline_type": ["type_pipeline", "pipe_type", "fluid"],
    "pipeline_diameter": ["diam_pipeline", "pipe_diam"],
    "pipeline_length": ["longueur_pipeline", "pipe_length"],
    "connected_asset_code": ["code_connecte", "connected_to", "endpoint"],
    "deck_name": ["nom_deck", "deck"],
    "weight_t": ["poids", "weight", "masse"],
    # PAX
    "nationality": ["nationalite", "pays", "country_origin"],
    "birth_date": ["date_naissance", "birthday", "dob", "date_de_naissance", "naissance"],
    "badge_number": ["badge", "numero_badge", "badge_no", "matricule"],
    "company_code": ["code_societe", "societe", "company", "entreprise", "tier_code"],
    # Project
    "start_date": ["date_debut", "debut", "begin_date", "start"],
    "end_date": ["date_fin", "fin", "finish_date", "end"],
    "priority": ["priorite", "urgence", "importance"],
    "budget": ["montant", "amount", "cout", "cost"],
    "progress": ["avancement", "completion", "pct_complete"],
    # Compliance
    "compliance_type_code": ["type_conformite", "compliance_type", "type_code", "habilitation"],
    "issued_at": ["date_emission", "issue_date", "delivre_le"],
    "expires_at": ["date_expiration", "expiry_date", "valide_jusqua", "valid_until"],
    "issuer": ["emetteur", "organisme", "certifier", "delivre_par"],
    "reference_number": ["numero_reference", "ref_number", "certificat_no"],
}


# ── Abstract handler ──────────────────────────────────────────────────────


class TargetObjectHandler(ABC):
    """Base class for per-object import handlers."""

    key: str
    label: str

    @abstractmethod
    def get_fields(self) -> list[TargetFieldDef]:
        ...

    @abstractmethod
    async def validate_row(
        self, row: dict[str, Any], entity_id: UUID, db: AsyncSession
    ) -> list[RowValidationError]:
        ...

    @abstractmethod
    async def find_duplicate(
        self, row: dict[str, Any], entity_id: UUID, db: AsyncSession
    ) -> UUID | None:
        ...

    @abstractmethod
    async def create_record(
        self, row: dict[str, Any], entity_id: UUID, user_id: UUID, db: AsyncSession
    ) -> UUID:
        ...

    @abstractmethod
    async def update_record(
        self, record_id: UUID, row: dict[str, Any], user_id: UUID, db: AsyncSession
    ) -> None:
        ...


# ── Concrete handlers ─────────────────────────────────────────────────────


class AssetHandler(TargetObjectHandler):
    key = "asset"
    label = "Assets"

    def get_fields(self) -> list[TargetFieldDef]:
        return [
            # Core
            TargetFieldDef(key="type", label="Type", type="string", required=True, example="platform"),
            TargetFieldDef(key="name", label="Nom", type="string", required=True, example="PF-Alpha"),
            TargetFieldDef(key="code", label="Code", type="string", example="ACF1"),
            TargetFieldDef(key="parent_code", label="Code parent", type="lookup", lookup_target="asset.code"),
            TargetFieldDef(key="description", label="Description", type="string"),
            TargetFieldDef(key="status", label="Statut", type="string", example="operational"),
            TargetFieldDef(key="latitude", label="Latitude", type="float", example="4.0511"),
            TargetFieldDef(key="longitude", label="Longitude", type="float", example="9.7679"),
            TargetFieldDef(key="max_pax", label="Capacité PAX", type="integer", example="120"),
            TargetFieldDef(key="active", label="Actif", type="boolean", example="oui"),
            # Common extended
            TargetFieldDef(key="year_installed", label="Année installation", type="integer", example="1983"),
            TargetFieldDef(key="orientation", label="Orientation", type="string", example="27°30"),
            # Platform structure
            TargetFieldDef(key="water_depth", label="Prof. eau (m)", type="float", example="15.4"),
            TargetFieldDef(key="altitude", label="Altitude (m)", type="float"),
            TargetFieldDef(key="jacket_dimensions", label="Dim. Jacket (m)", type="string", example="12 x 14"),
            TargetFieldDef(key="jacket_weight", label="Poids Jacket (T)", type="float", example="254"),
            TargetFieldDef(key="nb_piles", label="Nb pieux", type="integer", example="4"),
            TargetFieldDef(key="pile_diameter", label="Diam. pieux", type="string", example="30\" x 1"),
            TargetFieldDef(key="deck_dimensions", label="Dim. Deck (m)", type="string", example="20 x 26"),
            TargetFieldDef(key="deck_level", label="Niv. Deck", type="integer", example="4"),
            TargetFieldDef(key="top_deck_load", label="Charge Top Deck (T/m²)", type="float", example="1"),
            TargetFieldDef(key="has_winj", label="Injection eau (WINJ)", type="boolean", example="Yes"),
            TargetFieldDef(key="has_power", label="Production électrique", type="boolean", example="Yes"),
            # Equipment
            TargetFieldDef(key="capacity", label="Capacité (T ou m³)", type="float", example="10"),
            TargetFieldDef(key="max_range", label="Portée max (m)", type="float", example="8"),
            TargetFieldDef(key="equipment_subtype", label="Sous-type équipement", type="string", example="SUR RAILS"),
            TargetFieldDef(key="manufacturer", label="Fabricant", type="string"),
            TargetFieldDef(key="model_ref", label="Modèle / Référence", type="string"),
            TargetFieldDef(key="last_inspection", label="Dernière inspection", type="date"),
            TargetFieldDef(key="next_inspection", label="Prochaine inspection", type="date"),
            # Pipeline
            TargetFieldDef(key="connected_asset_code", label="Code asset connecté", type="lookup", lookup_target="asset.code"),
            TargetFieldDef(key="pipeline_type", label="Type pipeline", type="string", example="gas"),
            TargetFieldDef(key="pipeline_diameter", label="Diamètre pipeline", type="string"),
            TargetFieldDef(key="pipeline_length", label="Longueur pipeline (km)", type="float"),
            # Positioning
            TargetFieldDef(key="deck_name", label="Nom du deck", type="string", example="Main deck"),
            TargetFieldDef(key="elevation_msl", label="Élévation MSL (m)", type="float"),
            TargetFieldDef(key="position_x", label="Position X (m)", type="float"),
            TargetFieldDef(key="position_y", label="Position Y (m)", type="float"),
            TargetFieldDef(key="position_z", label="Position Z (m)", type="float"),
            # Dimensions
            TargetFieldDef(key="length_m", label="Longueur (m)", type="float"),
            TargetFieldDef(key="width_m", label="Largeur (m)", type="float"),
            TargetFieldDef(key="height_m", label="Hauteur (m)", type="float"),
            TargetFieldDef(key="weight_t", label="Poids (T)", type="float"),
        ]

    async def validate_row(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> list[RowValidationError]:
        errors: list[RowValidationError] = []
        idx = row.get("__row_index", 0)
        if not row.get("type"):
            errors.append(RowValidationError(row_index=idx, field="type", message="Type requis"))
        if not row.get("name"):
            errors.append(RowValidationError(row_index=idx, field="name", message="Nom requis"))
        if row.get("parent_code"):
            parent = await db.execute(
                select(Installation.id).where(Installation.entity_id == entity_id, Installation.code == str(row["parent_code"]).strip())
            )
            if not parent.scalar_one_or_none():
                errors.append(RowValidationError(row_index=idx, field="parent_code", message=f"Parent inconnu: {row['parent_code']}", severity="warning"))
        return errors

    async def find_duplicate(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> UUID | None:
        code = row.get("code")
        if not code:
            return None
        result = await db.execute(select(Installation.id).where(Installation.entity_id == entity_id, Installation.code == str(code).strip()))
        return result.scalar_one_or_none()

    def _resolve_asset_lookup(self, row: dict[str, Any], key: str, entity_id: UUID, db) -> UUID | None:
        """Helper to resolve a code lookup to an asset ID."""
        # This is called from create_record which is async, so we use it inline
        pass

    async def create_record(self, row: dict[str, Any], entity_id: UUID, user_id: UUID, db: AsyncSession) -> UUID:
        code = row.get("code")
        if not code:
            code = await generate_reference("AST", db, entity_id=entity_id)
        parent_id = None
        if row.get("parent_code"):
            res = await db.execute(select(Installation.id).where(Installation.entity_id == entity_id, Installation.code == str(row["parent_code"]).strip()))
            parent_id = res.scalar_one_or_none()
        connected_id = None
        if row.get("connected_asset_code"):
            res = await db.execute(select(Installation.id).where(Installation.entity_id == entity_id, Installation.code == str(row["connected_asset_code"]).strip()))
            connected_id = res.scalar_one_or_none()
        obj = Installation(
            entity_id=entity_id,
            type=str(row.get("type", "")).strip(),
            code=str(code).strip(),
            name=str(row.get("name", "")).strip(),
            parent_id=parent_id,
            latitude=_safe_float(row.get("latitude")),
            longitude=_safe_float(row.get("longitude")),
            max_pax=_safe_int(row.get("max_pax")),
            active=_safe_bool(row.get("active")) if row.get("active") is not None else True,
            description=_safe_str(row.get("description")),
            status=_safe_str(row.get("status")) or "operational",
            year_installed=_safe_int(row.get("year_installed")),
            orientation=_safe_str(row.get("orientation")),
            water_depth=_safe_float(row.get("water_depth")),
            altitude=_safe_float(row.get("altitude")),
            jacket_dimensions=_safe_str(row.get("jacket_dimensions")),
            jacket_weight=_safe_float(row.get("jacket_weight")),
            nb_piles=_safe_int(row.get("nb_piles")),
            pile_diameter=_safe_str(row.get("pile_diameter")),
            deck_dimensions=_safe_str(row.get("deck_dimensions")),
            deck_level=_safe_int(row.get("deck_level")),
            top_deck_load=_safe_float(row.get("top_deck_load")),
            has_winj=_safe_bool(row.get("has_winj")),
            has_power=_safe_bool(row.get("has_power")),
            capacity=_safe_float(row.get("capacity")),
            max_range=_safe_float(row.get("max_range")),
            equipment_subtype=_safe_str(row.get("equipment_subtype")),
            manufacturer=_safe_str(row.get("manufacturer")),
            model_ref=_safe_str(row.get("model_ref")),
            last_inspection=_safe_date(row.get("last_inspection")),
            next_inspection=_safe_date(row.get("next_inspection")),
            connected_asset_id=connected_id,
            pipeline_type=_safe_str(row.get("pipeline_type")),
            pipeline_diameter=_safe_str(row.get("pipeline_diameter")),
            pipeline_length=_safe_float(row.get("pipeline_length")),
            deck_name=_safe_str(row.get("deck_name")),
            elevation_msl=_safe_float(row.get("elevation_msl")),
            position_x=_safe_float(row.get("position_x")),
            position_y=_safe_float(row.get("position_y")),
            position_z=_safe_float(row.get("position_z")),
            length_m=_safe_float(row.get("length_m")),
            width_m=_safe_float(row.get("width_m")),
            height_m=_safe_float(row.get("height_m")),
            weight_t=_safe_float(row.get("weight_t")),
        )
        db.add(obj)
        await db.flush()
        return obj.id

    async def update_record(self, record_id: UUID, row: dict[str, Any], user_id: UUID, db: AsyncSession) -> None:
        result = await db.execute(select(Installation).where(Installation.id == record_id))
        obj = result.scalar_one()
        # String fields
        for key in ["name", "type", "description", "status", "orientation", "jacket_dimensions",
                     "pile_diameter", "deck_dimensions", "equipment_subtype", "manufacturer",
                     "model_ref", "pipeline_type", "pipeline_diameter", "deck_name"]:
            if row.get(key) is not None:
                setattr(obj, key, _safe_str(row[key]))
        # Float fields
        for key in ["latitude", "longitude", "water_depth", "altitude", "jacket_weight",
                     "top_deck_load", "capacity", "max_range", "pipeline_length",
                     "elevation_msl", "position_x", "position_y", "position_z",
                     "length_m", "width_m", "height_m", "weight_t"]:
            if row.get(key) is not None:
                setattr(obj, key, _safe_float(row[key]))
        # Integer fields
        for key in ["max_pax", "year_installed", "nb_piles", "deck_level"]:
            if row.get(key) is not None:
                setattr(obj, key, _safe_int(row[key]))
        # Boolean fields
        for key in ["active", "has_winj", "has_power"]:
            if row.get(key) is not None:
                val = _safe_bool(row[key])
                if val is not None:
                    setattr(obj, key, val)
        # Date fields
        for key in ["last_inspection", "next_inspection"]:
            if row.get(key) is not None:
                setattr(obj, key, _safe_date(row[key]))


class TierHandler(TargetObjectHandler):
    key = "tier"
    label = "Tiers"

    def get_fields(self) -> list[TargetFieldDef]:
        return [
            TargetFieldDef(key="name", label="Nom / Raison sociale", type="string", required=True, example="TotalEnergies"),
            TargetFieldDef(key="code", label="Code", type="string", example="TRS-2026-0001"),
            TargetFieldDef(key="type", label="Type", type="string", example="supplier"),
            TargetFieldDef(key="alias", label="Nom commercial", type="string"),
            TargetFieldDef(key="website", label="Site web", type="string"),
            TargetFieldDef(key="phone", label="Téléphone", type="string"),
            TargetFieldDef(key="email", label="Email", type="string"),
            TargetFieldDef(key="legal_form", label="Forme juridique", type="string", example="SARL"),
            TargetFieldDef(key="capital", label="Capital", type="float"),
            TargetFieldDef(key="currency", label="Devise", type="string", example="XAF"),
            TargetFieldDef(key="industry", label="Secteur", type="string"),
            TargetFieldDef(key="payment_terms", label="Conditions paiement", type="string"),
            TargetFieldDef(key="description", label="Description", type="string"),
            TargetFieldDef(key="active", label="Actif", type="boolean", example="oui"),
        ]

    async def validate_row(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> list[RowValidationError]:
        errors: list[RowValidationError] = []
        idx = row.get("__row_index", 0)
        if not row.get("name"):
            errors.append(RowValidationError(row_index=idx, field="name", message="Nom requis"))
        return errors

    async def find_duplicate(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> UUID | None:
        from sqlalchemy import func as sqla_func

        # 1. Check by code (exact match)
        code = row.get("code")
        if code:
            result = await db.execute(select(Tier.id).where(Tier.entity_id == entity_id, Tier.code == str(code).strip()))
            found = result.scalar_one_or_none()
            if found:
                return found

        # 2. Check by ExternalReference (e.g., SAP code)
        ext_code = row.get("external_code")
        if ext_code:
            from app.models.common import ExternalReference
            result = await db.execute(
                select(Tier.id)
                .join(ExternalReference, ExternalReference.owner_id == Tier.id)
                .where(
                    ExternalReference.owner_type == "tier",
                    ExternalReference.code == str(ext_code).strip(),
                    Tier.entity_id == entity_id,
                )
            )
            found = result.scalar_one_or_none()
            if found:
                return found

        # 3. Check by name (case-insensitive) — last resort
        name = row.get("name")
        if name:
            result = await db.execute(
                select(Tier.id).where(
                    Tier.entity_id == entity_id,
                    sqla_func.lower(Tier.name) == str(name).strip().lower(),
                )
            )
            found = result.scalar_one_or_none()
            if found:
                return found

        return None

    async def create_record(self, row: dict[str, Any], entity_id: UUID, user_id: UUID, db: AsyncSession) -> UUID:
        code = row.get("code")
        if not code:
            code = await generate_reference("TRS", db, entity_id=entity_id)
        obj = Tier(
            entity_id=entity_id,
            code=str(code).strip(),
            name=str(row.get("name", "")).strip(),
            type=str(row.get("type", "")).strip() or None,
            alias=str(row.get("alias", "")).strip() or None,
            website=str(row.get("website", "")).strip() or None,
            phone=str(row.get("phone", "")).strip() or None,
            email=str(row.get("email", "")).strip() or None,
            legal_form=str(row.get("legal_form", "")).strip() or None,
            capital=_safe_float(row.get("capital")),
            currency=str(row.get("currency", "")).strip() or "XAF",
            industry=str(row.get("industry", "")).strip() or None,
            payment_terms=str(row.get("payment_terms", "")).strip() or None,
            incoterm=str(row.get("incoterm", "")).strip() or None,
            incoterm_city=str(row.get("incoterm_city", "")).strip() or None,
            scope=str(row.get("scope", "")).strip() or "local",
            is_blocked=_safe_bool(row.get("is_blocked")) if row.get("is_blocked") is not None else False,
            description=str(row.get("description", "")).strip() or None,
            active=_safe_bool(row.get("active")) if row.get("active") is not None else True,
        )
        db.add(obj)
        await db.flush()

        # Create ExternalReference if external_code provided
        ext_code = row.get("external_code")
        ext_system = str(row.get("external_system", "SAP")).strip()
        if ext_code:
            from app.models.common import ExternalReference
            ref = ExternalReference(
                owner_type="tier",
                owner_id=obj.id,
                system=ext_system,
                code=str(ext_code).strip(),
                label=f"{ext_system} Code",
                created_by=user_id,
            )
            db.add(ref)

        return obj.id

    async def update_record(self, record_id: UUID, row: dict[str, Any], user_id: UUID, db: AsyncSession) -> None:
        result = await db.execute(select(Tier).where(Tier.id == record_id))
        obj = result.scalar_one()
        for field in ("name", "type", "alias", "website", "phone", "email", "legal_form", "industry", "payment_terms", "description"):
            val = row.get(field)
            if val is not None:
                setattr(obj, field, str(val).strip() or None)
        if row.get("capital") is not None:
            obj.capital = _safe_float(row["capital"])
        if row.get("active") is not None:
            val = _safe_bool(row["active"])
            if val is not None:
                obj.active = val


class ContactHandler(TargetObjectHandler):
    key = "contact"
    label = "Contacts"

    def get_fields(self) -> list[TargetFieldDef]:
        return [
            TargetFieldDef(key="first_name", label="Prénom", type="string", required=True, example="Jean"),
            TargetFieldDef(key="last_name", label="Nom", type="string", required=True, example="Dupont"),
            TargetFieldDef(key="tier_code", label="Code tiers", type="lookup", required=True, lookup_target="tier.code"),
            TargetFieldDef(key="civility", label="Civilité", type="string", example="Mr"),
            TargetFieldDef(key="email", label="Email", type="string"),
            TargetFieldDef(key="phone", label="Téléphone", type="string"),
            TargetFieldDef(key="position", label="Poste / Fonction", type="string"),
            TargetFieldDef(key="department", label="Service", type="string"),
            TargetFieldDef(key="active", label="Actif", type="boolean", example="oui"),
        ]

    async def validate_row(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> list[RowValidationError]:
        errors: list[RowValidationError] = []
        idx = row.get("__row_index", 0)
        if not row.get("first_name"):
            errors.append(RowValidationError(row_index=idx, field="first_name", message="Prénom requis"))
        if not row.get("last_name"):
            errors.append(RowValidationError(row_index=idx, field="last_name", message="Nom requis"))
        tier_code = row.get("tier_code")
        if not tier_code:
            errors.append(RowValidationError(row_index=idx, field="tier_code", message="Code tiers requis"))
        else:
            res = await db.execute(select(Tier.id).where(Tier.entity_id == entity_id, Tier.code == str(tier_code).strip()))
            if not res.scalar_one_or_none():
                errors.append(RowValidationError(row_index=idx, field="tier_code", message=f"Tiers inconnu: {tier_code}"))
        return errors

    async def find_duplicate(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> UUID | None:
        first = str(row.get("first_name", "")).strip()
        last = str(row.get("last_name", "")).strip()
        tier_code = str(row.get("tier_code", "")).strip()
        if not first or not last or not tier_code:
            return None
        stmt = (
            select(TierContact.id)
            .join(Tier, TierContact.tier_id == Tier.id)
            .where(
                Tier.entity_id == entity_id,
                Tier.code == tier_code,
                func.lower(TierContact.first_name) == first.lower(),
                func.lower(TierContact.last_name) == last.lower(),
            )
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def create_record(self, row: dict[str, Any], entity_id: UUID, user_id: UUID, db: AsyncSession) -> UUID:
        tier_code = str(row.get("tier_code", "")).strip()
        res = await db.execute(select(Tier.id).where(Tier.entity_id == entity_id, Tier.code == tier_code))
        tier_id = res.scalar_one()
        obj = TierContact(
            tier_id=tier_id,
            first_name=str(row.get("first_name", "")).strip(),
            last_name=str(row.get("last_name", "")).strip(),
            civility=str(row.get("civility", "")).strip() or None,
            email=str(row.get("email", "")).strip() or None,
            phone=str(row.get("phone", "")).strip() or None,
            position=str(row.get("position", "")).strip() or None,
            department=str(row.get("department", "")).strip() or None,
            active=_safe_bool(row.get("active")) if row.get("active") is not None else True,
        )
        db.add(obj)
        await db.flush()
        return obj.id

    async def update_record(self, record_id: UUID, row: dict[str, Any], user_id: UUID, db: AsyncSession) -> None:
        result = await db.execute(select(TierContact).where(TierContact.id == record_id))
        obj = result.scalar_one()
        for field in ("first_name", "last_name", "civility", "email", "phone", "position", "department"):
            val = row.get(field)
            if val is not None:
                setattr(obj, field, str(val).strip() or None)
        if row.get("active") is not None:
            val = _safe_bool(row["active"])
            if val is not None:
                obj.active = val


class PaxProfileHandler(TargetObjectHandler):
    key = "pax_profile"
    label = "Profils PAX"

    def get_fields(self) -> list[TargetFieldDef]:
        return [
            TargetFieldDef(key="first_name", label="Prénom", type="string", required=True, example="Jean"),
            TargetFieldDef(key="last_name", label="Nom", type="string", required=True, example="Dupont"),
            TargetFieldDef(key="type", label="Type", type="string", required=True, example="external"),
            TargetFieldDef(key="birth_date", label="Date de naissance", type="date", example="1985-03-15"),
            TargetFieldDef(key="nationality", label="Nationalité", type="string", example="Camerounaise"),
            TargetFieldDef(key="company_code", label="Code société", type="lookup", lookup_target="tier.code"),
            TargetFieldDef(key="badge_number", label="Numéro badge", type="string"),
        ]

    async def validate_row(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> list[RowValidationError]:
        errors: list[RowValidationError] = []
        idx = row.get("__row_index", 0)
        if not row.get("first_name"):
            errors.append(RowValidationError(row_index=idx, field="first_name", message="Prénom requis"))
        if not row.get("last_name"):
            errors.append(RowValidationError(row_index=idx, field="last_name", message="Nom requis"))
        pax_type = str(row.get("type", "")).strip().lower()
        if pax_type not in ("internal", "external"):
            errors.append(RowValidationError(row_index=idx, field="type", message="Type doit être 'internal' ou 'external'"))
        if row.get("company_code"):
            res = await db.execute(select(Tier.id).where(Tier.entity_id == entity_id, Tier.code == str(row["company_code"]).strip()))
            if not res.scalar_one_or_none():
                errors.append(RowValidationError(row_index=idx, field="company_code", message=f"Société inconnue: {row['company_code']}", severity="warning"))
        return errors

    async def find_duplicate(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> UUID | None:
        first = _normalize(str(row.get("first_name", "")))
        last = _normalize(str(row.get("last_name", "")))
        bd = _safe_date(row.get("birth_date"))
        if not first or not last:
            return None
        stmt = select(PaxProfile.id).where(
            PaxProfile.entity_id == entity_id,
            PaxProfile.first_name_normalized == first,
            PaxProfile.last_name_normalized == last,
        )
        if bd:
            stmt = stmt.where(PaxProfile.birth_date == bd)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def create_record(self, row: dict[str, Any], entity_id: UUID, user_id: UUID, db: AsyncSession) -> UUID:
        first = str(row.get("first_name", "")).strip()
        last = str(row.get("last_name", "")).strip()
        company_id = None
        if row.get("company_code"):
            res = await db.execute(select(Tier.id).where(Tier.entity_id == entity_id, Tier.code == str(row["company_code"]).strip()))
            company_id = res.scalar_one_or_none()
        obj = PaxProfile(
            entity_id=entity_id,
            type=str(row.get("type", "external")).strip().lower(),
            first_name=first,
            last_name=last,
            first_name_normalized=_normalize(first),
            last_name_normalized=_normalize(last),
            birth_date=_safe_date(row.get("birth_date")),
            nationality=str(row.get("nationality", "")).strip() or None,
            company_id=company_id,
            badge_number=str(row.get("badge_number", "")).strip() or None,
            status="active",
        )
        db.add(obj)
        await db.flush()
        return obj.id

    async def update_record(self, record_id: UUID, row: dict[str, Any], user_id: UUID, db: AsyncSession) -> None:
        result = await db.execute(select(PaxProfile).where(PaxProfile.id == record_id))
        obj = result.scalar_one()
        if row.get("first_name"):
            obj.first_name = str(row["first_name"]).strip()
            obj.first_name_normalized = _normalize(obj.first_name)
        if row.get("last_name"):
            obj.last_name = str(row["last_name"]).strip()
            obj.last_name_normalized = _normalize(obj.last_name)
        if row.get("nationality") is not None:
            obj.nationality = str(row["nationality"]).strip() or None
        if row.get("birth_date") is not None:
            obj.birth_date = _safe_date(row["birth_date"])
        if row.get("badge_number") is not None:
            obj.badge_number = str(row["badge_number"]).strip() or None


class ProjectHandler(TargetObjectHandler):
    key = "project"
    label = "Projets"

    def get_fields(self) -> list[TargetFieldDef]:
        return [
            TargetFieldDef(key="name", label="Nom", type="string", required=True, example="Extension plateforme"),
            TargetFieldDef(key="code", label="Code", type="string", example="PRJ-2026-0001"),
            TargetFieldDef(key="description", label="Description", type="string"),
            TargetFieldDef(key="status", label="Statut", type="string", example="active"),
            TargetFieldDef(key="priority", label="Priorité", type="string", example="medium"),
            TargetFieldDef(key="start_date", label="Date début", type="datetime", example="2026-04-01"),
            TargetFieldDef(key="end_date", label="Date fin", type="datetime", example="2026-12-31"),
            TargetFieldDef(key="budget", label="Budget", type="float", example="1500000"),
            TargetFieldDef(key="progress", label="Avancement %", type="integer", example="0"),
        ]

    async def validate_row(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> list[RowValidationError]:
        errors: list[RowValidationError] = []
        idx = row.get("__row_index", 0)
        if not row.get("name"):
            errors.append(RowValidationError(row_index=idx, field="name", message="Nom requis"))
        status_val = str(row.get("status", "")).strip().lower()
        if status_val and status_val not in ("draft", "planned", "active", "on_hold", "completed", "cancelled"):
            errors.append(RowValidationError(row_index=idx, field="status", message=f"Statut invalide: {status_val}", severity="warning"))
        return errors

    async def find_duplicate(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> UUID | None:
        code = row.get("code")
        if not code:
            return None
        result = await db.execute(select(Project.id).where(Project.entity_id == entity_id, Project.code == str(code).strip()))
        return result.scalar_one_or_none()

    async def create_record(self, row: dict[str, Any], entity_id: UUID, user_id: UUID, db: AsyncSession) -> UUID:
        code = row.get("code")
        if not code:
            code = await generate_reference("PRJ", db, entity_id=entity_id)
        obj = Project(
            entity_id=entity_id,
            code=str(code).strip(),
            name=str(row.get("name", "")).strip(),
            description=str(row.get("description", "")).strip() or None,
            status=str(row.get("status", "draft")).strip().lower() or "draft",
            priority=str(row.get("priority", "medium")).strip().lower() or "medium",
            start_date=_safe_datetime(row.get("start_date")),
            end_date=_safe_datetime(row.get("end_date")),
            budget=_safe_float(row.get("budget")),
            progress=_safe_int(row.get("progress")) or 0,
        )
        db.add(obj)
        await db.flush()
        return obj.id

    async def update_record(self, record_id: UUID, row: dict[str, Any], user_id: UUID, db: AsyncSession) -> None:
        result = await db.execute(select(Project).where(Project.id == record_id))
        obj = result.scalar_one()
        for field in ("name", "description", "status", "priority"):
            val = row.get(field)
            if val is not None:
                setattr(obj, field, str(val).strip() or None)
        if row.get("start_date") is not None:
            obj.start_date = _safe_datetime(row["start_date"])
        if row.get("end_date") is not None:
            obj.end_date = _safe_datetime(row["end_date"])
        if row.get("budget") is not None:
            obj.budget = _safe_float(row["budget"])
        if row.get("progress") is not None:
            obj.progress = _safe_int(row["progress"]) or 0


class ComplianceRecordHandler(TargetObjectHandler):
    key = "compliance_record"
    label = "Conformité"

    def get_fields(self) -> list[TargetFieldDef]:
        return [
            TargetFieldDef(key="compliance_type_code", label="Code type conformité", type="lookup", required=True, lookup_target="compliance_type.code"),
            TargetFieldDef(key="owner_type", label="Type porteur", type="string", required=True, example="tier_contact"),
            TargetFieldDef(key="owner_code", label="Code porteur", type="string", required=True, example="TRS-2026-0001"),
            TargetFieldDef(key="status", label="Statut", type="string", example="valid"),
            TargetFieldDef(key="issued_at", label="Date émission", type="datetime"),
            TargetFieldDef(key="expires_at", label="Date expiration", type="datetime"),
            TargetFieldDef(key="issuer", label="Émetteur", type="string"),
            TargetFieldDef(key="reference_number", label="Numéro référence", type="string"),
            TargetFieldDef(key="notes", label="Notes", type="string"),
        ]

    async def validate_row(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> list[RowValidationError]:
        errors: list[RowValidationError] = []
        idx = row.get("__row_index", 0)
        ct_code = row.get("compliance_type_code")
        if not ct_code:
            errors.append(RowValidationError(row_index=idx, field="compliance_type_code", message="Code type conformité requis"))
        else:
            res = await db.execute(select(ComplianceType.id).where(ComplianceType.entity_id == entity_id, ComplianceType.code == str(ct_code).strip()))
            if not res.scalar_one_or_none():
                errors.append(RowValidationError(row_index=idx, field="compliance_type_code", message=f"Type conformité inconnu: {ct_code}"))
        if not row.get("owner_type"):
            errors.append(RowValidationError(row_index=idx, field="owner_type", message="Type porteur requis"))
        if not row.get("owner_code"):
            errors.append(RowValidationError(row_index=idx, field="owner_code", message="Code porteur requis"))
        return errors

    async def find_duplicate(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> UUID | None:
        # No natural duplicate key for compliance records
        return None

    async def create_record(self, row: dict[str, Any], entity_id: UUID, user_id: UUID, db: AsyncSession) -> UUID:
        ct_code = str(row.get("compliance_type_code", "")).strip()
        res = await db.execute(select(ComplianceType.id).where(ComplianceType.entity_id == entity_id, ComplianceType.code == ct_code))
        ct_id = res.scalar_one()

        # Resolve owner_id from owner_code based on owner_type
        owner_type = str(row.get("owner_type", "")).strip()
        owner_code = str(row.get("owner_code", "")).strip()
        owner_id: UUID | None = None

        if owner_type == "tier":
            r = await db.execute(select(Tier.id).where(Tier.entity_id == entity_id, Tier.code == owner_code))
            owner_id = r.scalar_one()
        elif owner_type == "asset":
            r = await db.execute(select(Installation.id).where(Installation.entity_id == entity_id, Installation.code == owner_code))
            owner_id = r.scalar_one()

        if not owner_id:
            raise ValueError(f"Porteur introuvable: {owner_type}={owner_code}")

        obj = ComplianceRecord(
            entity_id=entity_id,
            compliance_type_id=ct_id,
            owner_type=owner_type,
            owner_id=owner_id,
            status=str(row.get("status", "valid")).strip() or "valid",
            issued_at=_safe_datetime(row.get("issued_at")),
            expires_at=_safe_datetime(row.get("expires_at")),
            issuer=str(row.get("issuer", "")).strip() or None,
            reference_number=str(row.get("reference_number", "")).strip() or None,
            notes=str(row.get("notes", "")).strip() or None,
            created_by=user_id,
        )
        db.add(obj)
        await db.flush()
        return obj.id

    async def update_record(self, record_id: UUID, row: dict[str, Any], user_id: UUID, db: AsyncSession) -> None:
        result = await db.execute(select(ComplianceRecord).where(ComplianceRecord.id == record_id))
        obj = result.scalar_one()
        for field in ("status", "issuer", "reference_number", "notes"):
            val = row.get(field)
            if val is not None:
                setattr(obj, field, str(val).strip() or None)
        if row.get("issued_at") is not None:
            obj.issued_at = _safe_datetime(row["issued_at"])
        if row.get("expires_at") is not None:
            obj.expires_at = _safe_datetime(row["expires_at"])


# ── Asset Registry handlers ───────────────────────────────────────────────


class ARFieldHandler(TargetObjectHandler):
    """Import handler for OilField (ar_fields)."""
    key = "ar_field"
    label = "Champs pétroliers"

    def get_fields(self) -> list[TargetFieldDef]:
        return [
            TargetFieldDef(key="code", label="Code", type="string", required=True, example="FLD-001"),
            TargetFieldDef(key="name", label="Nom", type="string", required=True, example="Campo Koulé"),
            TargetFieldDef(key="operator", label="Opérateur", type="string", example="Perenco"),
            TargetFieldDef(key="country", label="Pays (ISO)", type="string", required=True, example="CM"),
            TargetFieldDef(key="basin", label="Bassin", type="string", example="Rio del Rey"),
            TargetFieldDef(key="block_name", label="Bloc", type="string", example="Bloc B"),
            TargetFieldDef(key="environment", label="Environnement", type="string", example="OFFSHORE"),
            TargetFieldDef(key="status", label="Statut", type="string", example="OPERATIONAL"),
            TargetFieldDef(key="area_km2", label="Superficie (km²)", type="float", example="120.5"),
            TargetFieldDef(key="discovery_year", label="Année découverte", type="integer", example="1972"),
            TargetFieldDef(key="first_production_year", label="Année 1re production", type="integer", example="1978"),
            TargetFieldDef(key="latitude", label="Latitude", type="float", example="4.051"),
            TargetFieldDef(key="longitude", label="Longitude", type="float", example="9.768"),
            TargetFieldDef(key="notes", label="Notes", type="string"),
        ]

    async def validate_row(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> list[RowValidationError]:
        errors: list[RowValidationError] = []
        idx = row.get("__row_index", 0)
        if not row.get("code"):
            errors.append(RowValidationError(row_index=idx, field="code", message="Code requis"))
        if not row.get("name"):
            errors.append(RowValidationError(row_index=idx, field="name", message="Nom requis"))
        if not row.get("country"):
            errors.append(RowValidationError(row_index=idx, field="country", message="Pays requis"))
        return errors

    async def find_duplicate(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> UUID | None:
        code = row.get("code")
        if not code:
            return None
        result = await db.execute(
            select(OilField.id).where(OilField.entity_id == entity_id, OilField.code == str(code).strip())
        )
        return result.scalar_one_or_none()

    async def create_record(self, row: dict[str, Any], entity_id: UUID, user_id: UUID, db: AsyncSession) -> UUID:
        code = row.get("code")
        if not code:
            code = await generate_reference("FLD", db, entity_id=entity_id)
        obj = OilField(
            entity_id=entity_id,
            code=str(code).strip(),
            name=str(row.get("name", "")).strip(),
            operator=_safe_str(row.get("operator")) or "Perenco",
            country=str(row.get("country", "")).strip(),
            basin=_safe_str(row.get("basin")),
            block_name=_safe_str(row.get("block_name")),
            environment=_safe_str(row.get("environment")),
            status=_safe_str(row.get("status")) or "OPERATIONAL",
            area_km2=_safe_float(row.get("area_km2")),
            discovery_year=_safe_int(row.get("discovery_year")),
            first_production_year=_safe_int(row.get("first_production_year")),
            centroid_latitude=_safe_float(row.get("latitude")),
            centroid_longitude=_safe_float(row.get("longitude")),
            notes=_safe_str(row.get("notes")),
        )
        db.add(obj)
        await db.flush()
        return obj.id

    async def update_record(self, record_id: UUID, row: dict[str, Any], user_id: UUID, db: AsyncSession) -> None:
        result = await db.execute(select(OilField).where(OilField.id == record_id))
        obj = result.scalar_one()
        for key in ("name", "operator", "country", "basin", "block_name", "environment", "status", "notes"):
            if row.get(key) is not None:
                setattr(obj, key, _safe_str(row[key]))
        for key in ("area_km2",):
            if row.get(key) is not None:
                setattr(obj, key, _safe_float(row[key]))
        if row.get("latitude") is not None:
            obj.centroid_latitude = _safe_float(row["latitude"])
        if row.get("longitude") is not None:
            obj.centroid_longitude = _safe_float(row["longitude"])
        for key in ("discovery_year", "first_production_year"):
            if row.get(key) is not None:
                setattr(obj, key, _safe_int(row[key]))


class ARSiteHandler(TargetObjectHandler):
    """Import handler for OilSite (ar_sites)."""
    key = "ar_site"
    label = "Sites"

    def get_fields(self) -> list[TargetFieldDef]:
        return [
            TargetFieldDef(key="code", label="Code", type="string", required=True, example="SIT-001"),
            TargetFieldDef(key="name", label="Nom", type="string", required=True, example="EBOME Complex"),
            TargetFieldDef(key="site_type", label="Type de site", type="string", required=True, example="OFFSHORE_PLATFORM_COMPLEX"),
            TargetFieldDef(key="environment", label="Environnement", type="string", required=True, example="OFFSHORE"),
            TargetFieldDef(key="country", label="Pays (ISO)", type="string", required=True, example="CM"),
            TargetFieldDef(key="field_code", label="Code champ", type="lookup", required=True, lookup_target="ar_field.code"),
            TargetFieldDef(key="latitude", label="Latitude", type="float", example="4.051"),
            TargetFieldDef(key="longitude", label="Longitude", type="float", example="9.768"),
            TargetFieldDef(key="manned", label="Habité", type="boolean", example="oui"),
            TargetFieldDef(key="status", label="Statut", type="string", example="OPERATIONAL"),
            TargetFieldDef(key="elevation_m", label="Profondeur eau (m)", type="float"),
            TargetFieldDef(key="max_pob", label="Capacité POB", type="integer", example="80"),
            TargetFieldDef(key="notes", label="Notes", type="string"),
        ]

    async def validate_row(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> list[RowValidationError]:
        errors: list[RowValidationError] = []
        idx = row.get("__row_index", 0)
        if not row.get("code"):
            errors.append(RowValidationError(row_index=idx, field="code", message="Code requis"))
        if not row.get("name"):
            errors.append(RowValidationError(row_index=idx, field="name", message="Nom requis"))
        if not row.get("site_type"):
            errors.append(RowValidationError(row_index=idx, field="site_type", message="Type de site requis"))
        if not row.get("environment"):
            errors.append(RowValidationError(row_index=idx, field="environment", message="Environnement requis"))
        if not row.get("country"):
            errors.append(RowValidationError(row_index=idx, field="country", message="Pays requis"))
        field_code = row.get("field_code")
        if not field_code:
            errors.append(RowValidationError(row_index=idx, field="field_code", message="Code champ requis"))
        else:
            res = await db.execute(
                select(OilField.id).where(OilField.entity_id == entity_id, OilField.code == str(field_code).strip())
            )
            if not res.scalar_one_or_none():
                errors.append(RowValidationError(row_index=idx, field="field_code", message=f"Champ inconnu: {field_code}"))
        return errors

    async def find_duplicate(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> UUID | None:
        code = row.get("code")
        if not code:
            return None
        result = await db.execute(
            select(OilSite.id).where(OilSite.entity_id == entity_id, OilSite.code == str(code).strip())
        )
        return result.scalar_one_or_none()

    async def create_record(self, row: dict[str, Any], entity_id: UUID, user_id: UUID, db: AsyncSession) -> UUID:
        code = row.get("code")
        if not code:
            code = await generate_reference("SIT", db, entity_id=entity_id)
        # Resolve field_id from field_code
        field_code = str(row.get("field_code", "")).strip()
        res = await db.execute(
            select(OilField.id).where(OilField.entity_id == entity_id, OilField.code == field_code)
        )
        field_id = res.scalar_one()
        obj = OilSite(
            entity_id=entity_id,
            field_id=field_id,
            code=str(code).strip(),
            name=str(row.get("name", "")).strip(),
            site_type=str(row.get("site_type", "")).strip(),
            environment=str(row.get("environment", "")).strip(),
            country=str(row.get("country", "")).strip(),
            latitude=_safe_float(row.get("latitude")),
            longitude=_safe_float(row.get("longitude")),
            manned=_safe_bool(row.get("manned")) if row.get("manned") is not None else True,
            status=_safe_str(row.get("status")) or "OPERATIONAL",
            water_depth_m=_safe_float(row.get("elevation_m")),
            pob_capacity=_safe_int(row.get("max_pob")),
            notes=_safe_str(row.get("notes")),
        )
        db.add(obj)
        await db.flush()
        return obj.id

    async def update_record(self, record_id: UUID, row: dict[str, Any], user_id: UUID, db: AsyncSession) -> None:
        result = await db.execute(select(OilSite).where(OilSite.id == record_id))
        obj = result.scalar_one()
        for key in ("name", "site_type", "environment", "country", "status", "notes"):
            if row.get(key) is not None:
                setattr(obj, key, _safe_str(row[key]))
        for key in ("latitude", "longitude"):
            if row.get(key) is not None:
                setattr(obj, key, _safe_float(row[key]))
        if row.get("elevation_m") is not None:
            obj.water_depth_m = _safe_float(row["elevation_m"])
        if row.get("max_pob") is not None:
            obj.pob_capacity = _safe_int(row["max_pob"])
        if row.get("manned") is not None:
            val = _safe_bool(row["manned"])
            if val is not None:
                obj.manned = val


class ARInstallationHandler(TargetObjectHandler):
    """Import handler for Installation (ar_installations)."""
    key = "ar_installation"
    label = "Installations"

    def get_fields(self) -> list[TargetFieldDef]:
        return [
            TargetFieldDef(key="code", label="Code", type="string", required=True, example="INS-001"),
            TargetFieldDef(key="name", label="Nom", type="string", required=True, example="EBOME Marine"),
            TargetFieldDef(key="installation_type", label="Type", type="string", required=True, example="FIXED_JACKET_PLATFORM"),
            TargetFieldDef(key="environment", label="Environnement", type="string", required=True, example="OFFSHORE"),
            TargetFieldDef(key="status", label="Statut", type="string", example="OPERATIONAL"),
            TargetFieldDef(key="site_code", label="Code site", type="lookup", required=True, lookup_target="ar_site.code"),
            TargetFieldDef(key="is_manned", label="Habité", type="boolean", example="oui"),
            TargetFieldDef(key="water_depth_m", label="Profondeur eau (m)", type="float", example="15.4"),
            TargetFieldDef(key="max_pob", label="Capacité POB", type="integer", example="120"),
            TargetFieldDef(key="latitude", label="Latitude", type="float", example="4.051"),
            TargetFieldDef(key="longitude", label="Longitude", type="float", example="9.768"),
            TargetFieldDef(key="commissioning_date", label="Date mise en service", type="date", example="1983-06-15"),
            TargetFieldDef(key="notes", label="Notes", type="string"),
        ]

    async def validate_row(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> list[RowValidationError]:
        errors: list[RowValidationError] = []
        idx = row.get("__row_index", 0)
        if not row.get("code"):
            errors.append(RowValidationError(row_index=idx, field="code", message="Code requis"))
        if not row.get("name"):
            errors.append(RowValidationError(row_index=idx, field="name", message="Nom requis"))
        if not row.get("installation_type"):
            errors.append(RowValidationError(row_index=idx, field="installation_type", message="Type requis"))
        if not row.get("environment"):
            errors.append(RowValidationError(row_index=idx, field="environment", message="Environnement requis"))
        site_code = row.get("site_code")
        if not site_code:
            errors.append(RowValidationError(row_index=idx, field="site_code", message="Code site requis"))
        else:
            res = await db.execute(
                select(OilSite.id).where(OilSite.entity_id == entity_id, OilSite.code == str(site_code).strip())
            )
            if not res.scalar_one_or_none():
                errors.append(RowValidationError(row_index=idx, field="site_code", message=f"Site inconnu: {site_code}"))
        return errors

    async def find_duplicate(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> UUID | None:
        code = row.get("code")
        if not code:
            return None
        result = await db.execute(
            select(Installation.id).where(Installation.entity_id == entity_id, Installation.code == str(code).strip())
        )
        return result.scalar_one_or_none()

    async def create_record(self, row: dict[str, Any], entity_id: UUID, user_id: UUID, db: AsyncSession) -> UUID:
        code = row.get("code")
        if not code:
            code = await generate_reference("INS", db, entity_id=entity_id)
        # Resolve site_id from site_code
        site_code = str(row.get("site_code", "")).strip()
        res = await db.execute(
            select(OilSite.id).where(OilSite.entity_id == entity_id, OilSite.code == site_code)
        )
        site_id = res.scalar_one()
        obj = Installation(
            entity_id=entity_id,
            site_id=site_id,
            code=str(code).strip(),
            name=str(row.get("name", "")).strip(),
            installation_type=str(row.get("installation_type", "")).strip(),
            environment=str(row.get("environment", "")).strip(),
            status=_safe_str(row.get("status")) or "OPERATIONAL",
            is_manned=_safe_bool(row.get("is_manned")) if row.get("is_manned") is not None else True,
            water_depth_m=_safe_float(row.get("water_depth_m")),
            pob_max=_safe_int(row.get("max_pob")),
            latitude=_safe_float(row.get("latitude")),
            longitude=_safe_float(row.get("longitude")),
            commissioning_date=_safe_date(row.get("commissioning_date")),
            notes=_safe_str(row.get("notes")),
        )
        db.add(obj)
        await db.flush()
        return obj.id

    async def update_record(self, record_id: UUID, row: dict[str, Any], user_id: UUID, db: AsyncSession) -> None:
        result = await db.execute(select(Installation).where(Installation.id == record_id))
        obj = result.scalar_one()
        for key in ("name", "installation_type", "environment", "status", "notes"):
            if row.get(key) is not None:
                setattr(obj, key, _safe_str(row[key]))
        for key in ("latitude", "longitude", "water_depth_m"):
            if row.get(key) is not None:
                setattr(obj, key, _safe_float(row[key]))
        if row.get("max_pob") is not None:
            obj.pob_max = _safe_int(row["max_pob"])
        if row.get("commissioning_date") is not None:
            obj.commissioning_date = _safe_date(row["commissioning_date"])
        if row.get("is_manned") is not None:
            val = _safe_bool(row["is_manned"])
            if val is not None:
                obj.is_manned = val


class AREquipmentHandler(TargetObjectHandler):
    """Import handler for RegistryEquipment (ar_equipment)."""
    key = "ar_equipment"
    label = "Équipements"

    def get_fields(self) -> list[TargetFieldDef]:
        return [
            TargetFieldDef(key="tag_number", label="Tag number", type="string", required=True, example="P-101A"),
            TargetFieldDef(key="name", label="Nom", type="string", required=True, example="Pompe export pétrole"),
            TargetFieldDef(key="equipment_class", label="Classe équipement", type="string", required=True, example="PUMP"),
            TargetFieldDef(key="status", label="Statut", type="string", example="OPERATIONAL"),
            TargetFieldDef(key="criticality", label="Criticité (A/B/C)", type="string", example="A"),
            TargetFieldDef(key="manufacturer", label="Fabricant", type="string", example="Sulzer"),
            TargetFieldDef(key="model", label="Modèle", type="string", example="MSD 40/8"),
            TargetFieldDef(key="serial_number", label="N° série", type="string", example="SN-2024-001"),
            TargetFieldDef(key="installation_code", label="Code installation", type="lookup", lookup_target="ar_installation.code"),
            TargetFieldDef(key="year_manufactured", label="Année fabrication", type="integer", example="2020"),
            TargetFieldDef(key="year_installed", label="Année installation", type="integer", example="2021"),
            TargetFieldDef(key="notes", label="Notes", type="string"),
        ]

    async def validate_row(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> list[RowValidationError]:
        errors: list[RowValidationError] = []
        idx = row.get("__row_index", 0)
        if not row.get("tag_number"):
            errors.append(RowValidationError(row_index=idx, field="tag_number", message="Tag number requis"))
        if not row.get("name"):
            errors.append(RowValidationError(row_index=idx, field="name", message="Nom requis"))
        if not row.get("equipment_class"):
            errors.append(RowValidationError(row_index=idx, field="equipment_class", message="Classe équipement requise"))
        inst_code = row.get("installation_code")
        if inst_code:
            res = await db.execute(
                select(Installation.id).where(Installation.entity_id == entity_id, Installation.code == str(inst_code).strip())
            )
            if not res.scalar_one_or_none():
                errors.append(RowValidationError(row_index=idx, field="installation_code", message=f"Installation inconnue: {inst_code}", severity="warning"))
        return errors

    async def find_duplicate(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> UUID | None:
        tag = row.get("tag_number")
        if not tag:
            return None
        result = await db.execute(
            select(RegistryEquipment.id).where(
                RegistryEquipment.entity_id == entity_id,
                RegistryEquipment.tag_number == str(tag).strip(),
            )
        )
        return result.scalar_one_or_none()

    async def create_record(self, row: dict[str, Any], entity_id: UUID, user_id: UUID, db: AsyncSession) -> UUID:
        # Resolve installation_id from installation_code
        installation_id = None
        inst_code = row.get("installation_code")
        if inst_code:
            res = await db.execute(
                select(Installation.id).where(Installation.entity_id == entity_id, Installation.code == str(inst_code).strip())
            )
            installation_id = res.scalar_one_or_none()
        obj = RegistryEquipment(
            entity_id=entity_id,
            tag_number=str(row.get("tag_number", "")).strip(),
            name=str(row.get("name", "")).strip(),
            equipment_class=str(row.get("equipment_class", "")).strip(),
            status=_safe_str(row.get("status")) or "OPERATIONAL",
            criticality=_safe_str(row.get("criticality")),
            manufacturer=_safe_str(row.get("manufacturer")),
            model=_safe_str(row.get("model")),
            serial_number=_safe_str(row.get("serial_number")),
            installation_id=installation_id,
            year_manufactured=_safe_int(row.get("year_manufactured")),
            year_installed=_safe_int(row.get("year_installed")),
            notes=_safe_str(row.get("notes")),
            created_by=user_id,
        )
        db.add(obj)
        await db.flush()
        return obj.id

    async def update_record(self, record_id: UUID, row: dict[str, Any], user_id: UUID, db: AsyncSession) -> None:
        result = await db.execute(select(RegistryEquipment).where(RegistryEquipment.id == record_id))
        obj = result.scalar_one()
        for key in ("name", "equipment_class", "status", "criticality", "manufacturer", "model", "serial_number", "notes"):
            if row.get(key) is not None:
                setattr(obj, key, _safe_str(row[key]))
        for key in ("year_manufactured", "year_installed"):
            if row.get(key) is not None:
                setattr(obj, key, _safe_int(row[key]))
        # Re-resolve installation if code changed
        inst_code = row.get("installation_code")
        if inst_code is not None:
            res = await db.execute(
                select(Installation.id).where(Installation.entity_id == obj.entity_id, Installation.code == str(inst_code).strip())
            )
            obj.installation_id = res.scalar_one_or_none()


class ARPipelineHandler(TargetObjectHandler):
    """Import handler for RegistryPipeline (ar_pipelines)."""
    key = "ar_pipeline"
    label = "Pipelines"

    def get_fields(self) -> list[TargetFieldDef]:
        return [
            TargetFieldDef(key="pipeline_id", label="ID pipeline", type="string", required=True, example="PL-001"),
            TargetFieldDef(key="name", label="Nom", type="string", required=True, example="Export Oil 12\""),
            TargetFieldDef(key="service", label="Service", type="string", required=True, example="EXPORT_OIL"),
            TargetFieldDef(key="status", label="Statut", type="string", example="OPERATIONAL"),
            TargetFieldDef(key="from_installation_code", label="Code installation départ", type="lookup", required=True, lookup_target="ar_installation.code"),
            TargetFieldDef(key="to_installation_code", label="Code installation arrivée", type="lookup", required=True, lookup_target="ar_installation.code"),
            TargetFieldDef(key="nominal_diameter_in", label="Diamètre nominal (in)", type="float", required=True, example="12"),
            TargetFieldDef(key="wall_thickness_mm", label="Épaisseur paroi (mm)", type="float", example="12.7"),
            TargetFieldDef(key="material_grade", label="Grade matériau", type="string", example="API 5L X65"),
            TargetFieldDef(key="total_length_km", label="Longueur totale (km)", type="float", example="24.5"),
            TargetFieldDef(key="design_pressure_barg", label="Pression design (barg)", type="float", required=True, example="100"),
            TargetFieldDef(key="design_temperature_c", label="Température design (°C)", type="float", required=True, example="80"),
            TargetFieldDef(key="installation_year", label="Année installation", type="integer", example="1995"),
            TargetFieldDef(key="notes", label="Notes", type="string"),
        ]

    async def validate_row(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> list[RowValidationError]:
        errors: list[RowValidationError] = []
        idx = row.get("__row_index", 0)
        if not row.get("pipeline_id"):
            errors.append(RowValidationError(row_index=idx, field="pipeline_id", message="ID pipeline requis"))
        if not row.get("name"):
            errors.append(RowValidationError(row_index=idx, field="name", message="Nom requis"))
        if not row.get("service"):
            errors.append(RowValidationError(row_index=idx, field="service", message="Service requis"))
        if row.get("nominal_diameter_in") is None:
            errors.append(RowValidationError(row_index=idx, field="nominal_diameter_in", message="Diamètre nominal requis"))
        if row.get("design_pressure_barg") is None:
            errors.append(RowValidationError(row_index=idx, field="design_pressure_barg", message="Pression design requise"))
        if row.get("design_temperature_c") is None:
            errors.append(RowValidationError(row_index=idx, field="design_temperature_c", message="Température design requise"))
        # Validate from_installation
        from_code = row.get("from_installation_code")
        if not from_code:
            errors.append(RowValidationError(row_index=idx, field="from_installation_code", message="Code installation départ requis"))
        else:
            res = await db.execute(
                select(Installation.id).where(Installation.entity_id == entity_id, Installation.code == str(from_code).strip())
            )
            if not res.scalar_one_or_none():
                errors.append(RowValidationError(row_index=idx, field="from_installation_code", message=f"Installation inconnue: {from_code}"))
        # Validate to_installation
        to_code = row.get("to_installation_code")
        if not to_code:
            errors.append(RowValidationError(row_index=idx, field="to_installation_code", message="Code installation arrivée requis"))
        else:
            res = await db.execute(
                select(Installation.id).where(Installation.entity_id == entity_id, Installation.code == str(to_code).strip())
            )
            if not res.scalar_one_or_none():
                errors.append(RowValidationError(row_index=idx, field="to_installation_code", message=f"Installation inconnue: {to_code}"))
        return errors

    async def find_duplicate(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> UUID | None:
        pid = row.get("pipeline_id")
        if not pid:
            return None
        result = await db.execute(
            select(RegistryPipeline.id).where(
                RegistryPipeline.entity_id == entity_id,
                RegistryPipeline.pipeline_id == str(pid).strip(),
            )
        )
        return result.scalar_one_or_none()

    async def create_record(self, row: dict[str, Any], entity_id: UUID, user_id: UUID, db: AsyncSession) -> UUID:
        pid = row.get("pipeline_id")
        if not pid:
            pid = await generate_reference("PL", db, entity_id=entity_id)
        # Resolve from/to installation IDs
        from_code = str(row.get("from_installation_code", "")).strip()
        res = await db.execute(
            select(Installation.id).where(Installation.entity_id == entity_id, Installation.code == from_code)
        )
        from_id = res.scalar_one()
        to_code = str(row.get("to_installation_code", "")).strip()
        res = await db.execute(
            select(Installation.id).where(Installation.entity_id == entity_id, Installation.code == to_code)
        )
        to_id = res.scalar_one()
        obj = RegistryPipeline(
            entity_id=entity_id,
            pipeline_id=str(pid).strip(),
            name=str(row.get("name", "")).strip(),
            service=str(row.get("service", "")).strip(),
            status=_safe_str(row.get("status")) or "OPERATIONAL",
            from_installation_id=from_id,
            to_installation_id=to_id,
            nominal_diameter_in=_safe_float(row.get("nominal_diameter_in")) or 0,
            wall_thickness_mm=_safe_float(row.get("wall_thickness_mm")),
            pipe_grade=_safe_str(row.get("material_grade")),
            total_length_km=_safe_float(row.get("total_length_km")),
            design_pressure_barg=_safe_float(row.get("design_pressure_barg")) or 0,
            design_temp_max_c=_safe_float(row.get("design_temperature_c")) or 0,
            installation_year=_safe_int(row.get("installation_year")),
            notes=_safe_str(row.get("notes")),
        )
        db.add(obj)
        await db.flush()
        return obj.id

    async def update_record(self, record_id: UUID, row: dict[str, Any], user_id: UUID, db: AsyncSession) -> None:
        result = await db.execute(select(RegistryPipeline).where(RegistryPipeline.id == record_id))
        obj = result.scalar_one()
        for key in ("name", "service", "status", "notes"):
            if row.get(key) is not None:
                setattr(obj, key, _safe_str(row[key]))
        for key in ("nominal_diameter_in", "wall_thickness_mm", "total_length_km", "design_pressure_barg"):
            if row.get(key) is not None:
                setattr(obj, key, _safe_float(row[key]))
        if row.get("design_temperature_c") is not None:
            obj.design_temp_max_c = _safe_float(row["design_temperature_c"])
        if row.get("material_grade") is not None:
            obj.pipe_grade = _safe_str(row["material_grade"])
        if row.get("installation_year") is not None:
            obj.installation_year = _safe_int(row["installation_year"])
        # Re-resolve from/to installations if codes changed
        from_code = row.get("from_installation_code")
        if from_code is not None:
            res = await db.execute(
                select(Installation.id).where(Installation.entity_id == obj.entity_id, Installation.code == str(from_code).strip())
            )
            found = res.scalar_one_or_none()
            if found:
                obj.from_installation_id = found
        to_code = row.get("to_installation_code")
        if to_code is not None:
            res = await db.execute(
                select(Installation.id).where(Installation.entity_id == obj.entity_id, Installation.code == str(to_code).strip())
            )
            found = res.scalar_one_or_none()
            if found:
                obj.to_installation_id = found


# ── Handler registry ──────────────────────────────────────────────────────

HANDLERS: dict[str, TargetObjectHandler] = {}

def _register_handler(handler: TargetObjectHandler) -> None:
    HANDLERS[handler.key] = handler

_register_handler(AssetHandler())
_register_handler(TierHandler())
_register_handler(ContactHandler())
_register_handler(PaxProfileHandler())
_register_handler(ProjectHandler())
_register_handler(ComplianceRecordHandler())
_register_handler(ARFieldHandler())
_register_handler(ARSiteHandler())
_register_handler(ARInstallationHandler())
_register_handler(AREquipmentHandler())
_register_handler(ARPipelineHandler())


# ── Transform engine ──────────────────────────────────────────────────────

# -- Country normalisation map (lowercased keys → ISO 3166-1 alpha-2) ------

COUNTRY_MAP: dict[str, str] = {
    # ISO alpha-2 pass-through (lowercased)
    "fr": "FR", "cm": "CM", "ga": "GA", "cg": "CG", "cd": "CD",
    "us": "US", "gb": "GB", "de": "DE", "es": "ES", "it": "IT",
    "be": "BE", "ch": "CH", "ca": "CA", "nl": "NL", "pt": "PT",
    "br": "BR", "cn": "CN", "jp": "JP", "in": "IN", "za": "ZA",
    "no": "NO", "se": "SE", "dk": "DK", "fi": "FI", "at": "AT",
    "ie": "IE", "gr": "GR", "tr": "TR", "ru": "RU", "pl": "PL",
    "ro": "RO", "hu": "HU", "cz": "CZ", "ma": "MA", "dz": "DZ",
    "tn": "TN", "eg": "EG", "ke": "KE", "tz": "TZ", "gh": "GH",
    "ml": "ML", "ne": "NE", "bf": "BF", "bj": "BJ", "tg": "TG",
    "mg": "MG", "mu": "MU", "ly": "LY", "sd": "SD", "sn": "SN",
    "ci": "CI", "gq": "GQ", "ng": "NG", "ao": "AO", "td": "TD",
    "cf": "CF",
    # ISO alpha-3
    "fra": "FR", "cmr": "CM", "gab": "GA", "cog": "CG", "cod": "CD",
    "usa": "US", "gbr": "GB", "deu": "DE", "esp": "ES", "ita": "IT",
    "bel": "BE", "che": "CH", "can": "CA", "nld": "NL", "prt": "PT",
    "bra": "BR", "chn": "CN", "jpn": "JP", "ind": "IN", "zaf": "ZA",
    "nor": "NO", "swe": "SE", "dnk": "DK", "fin": "FI", "aut": "AT",
    "irl": "IE", "grc": "GR", "tur": "TR", "rus": "RU", "pol": "PL",
    "rou": "RO", "hun": "HU", "cze": "CZ", "mar": "MA", "dza": "DZ",
    "tun": "TN", "egy": "EG", "ken": "KE", "tza": "TZ", "gha": "GH",
    "mli": "ML", "ner": "NE", "bfa": "BF", "ben": "BJ", "tgo": "TG",
    "mdg": "MG", "mus": "MU", "lby": "LY", "sdn": "SD", "sen": "SN",
    "civ": "CI", "gnq": "GQ", "nga": "NG", "ago": "AO", "tcd": "TD",
    "caf": "CF",
    # French names
    "france": "FR", "cameroun": "CM", "gabon": "GA", "congo": "CG",
    "république démocratique du congo": "CD", "rdc": "CD",
    "états-unis": "US", "etats-unis": "US",
    "allemagne": "DE", "espagne": "ES", "italie": "IT",
    "royaume-uni": "GB", "belgique": "BE", "suisse": "CH", "canada": "CA",
    "pays-bas": "NL", "portugal": "PT",
    "brésil": "BR", "chine": "CN", "japon": "JP", "inde": "IN",
    "afrique du sud": "ZA",
    "norvège": "NO", "suède": "SE", "danemark": "DK", "finlande": "FI",
    "autriche": "AT", "irlande": "IE", "grèce": "GR", "turquie": "TR",
    "russie": "RU", "pologne": "PL", "roumanie": "RO", "hongrie": "HU",
    "république tchèque": "CZ", "republique tcheque": "CZ",
    "maroc": "MA", "algérie": "DZ", "algerie": "DZ",
    "tunisie": "TN", "égypte": "EG", "egypte": "EG",
    "tanzanie": "TZ",
    "sénégal": "SN", "senegal": "SN",
    "côte d'ivoire": "CI", "cote d'ivoire": "CI", "cote divoire": "CI",
    "guinée équatoriale": "GQ", "guinee equatoriale": "GQ",
    "nigéria": "NG",
    "tchad": "TD", "centrafrique": "CF",
    "bénin": "BJ", "benin": "BJ",
    "maurice": "MU", "madagascar": "MG",
    "libye": "LY", "soudan": "SD",
    "burkina faso": "BF", "mali": "ML", "niger": "NE", "togo": "TG",
    "ghana": "GH",
    # English names
    "cameroon": "CM",
    "united states": "US", "united states of america": "US",
    "germany": "DE", "spain": "ES", "italy": "IT",
    "united kingdom": "GB", "belgium": "BE", "switzerland": "CH",
    "netherlands": "NL",
    "brazil": "BR", "china": "CN", "japan": "JP", "india": "IN",
    "south africa": "ZA",
    "norway": "NO", "sweden": "SE", "denmark": "DK", "finland": "FI",
    "austria": "AT", "ireland": "IE", "greece": "GR", "turkey": "TR",
    "russia": "RU", "poland": "PL", "romania": "RO", "hungary": "HU",
    "czech republic": "CZ", "czechia": "CZ",
    "morocco": "MA", "algeria": "DZ", "tunisia": "TN", "egypt": "EG",
    "kenya": "KE", "tanzania": "TZ",
    "ivory coast": "CI",
    "equatorial guinea": "GQ",
    "nigeria": "NG", "angola": "AO", "chad": "TD",
    "central african republic": "CF",
    "libya": "LY", "sudan": "SD",
    "mauritius": "MU",
    # Additional countries
    "mexico": "MX", "mexique": "MX", "mex": "MX",
    "colombia": "CO", "colombie": "CO", "col": "CO",
    "argentina": "AR", "argentine": "AR", "arg": "AR",
    "chile": "CL", "chili": "CL", "chl": "CL",
    "peru": "PE", "pérou": "PE", "perou": "PE", "per": "PE",
    "venezuela": "VE", "ven": "VE",
    "ecuador": "EC", "équateur": "EC", "equateur": "EC", "ecu": "EC",
    "australia": "AU", "australie": "AU", "aus": "AU",
    "new zealand": "NZ", "nouvelle-zélande": "NZ", "nzl": "NZ",
    "saudi arabia": "SA", "arabie saoudite": "SA", "sau": "SA",
    "united arab emirates": "AE", "émirats arabes unis": "AE", "are": "AE",
    "qatar": "QA", "qat": "QA",
    "singapore": "SG", "singapour": "SG", "sgp": "SG",
    "south korea": "KR", "corée du sud": "KR", "kor": "KR",
    "thailand": "TH", "thaïlande": "TH", "tha": "TH",
    "indonesia": "ID", "indonésie": "ID", "idn": "ID",
    "malaysia": "MY", "malaisie": "MY", "mys": "MY",
    "philippines": "PH", "phl": "PH",
    "vietnam": "VN", "viêt nam": "VN", "vnm": "VN",
    "pakistan": "PK", "pak": "PK",
    "bangladesh": "BD", "bgd": "BD",
    "sri lanka": "LK", "lka": "LK",
    "cuba": "CU", "cub": "CU",
    "haiti": "HT", "haïti": "HT", "hti": "HT",
    "jamaica": "JM", "jamaïque": "JM", "jam": "JM",
    "trinidad and tobago": "TT", "trinité-et-tobago": "TT", "tto": "TT",
    "mozambique": "MZ", "moz": "MZ",
    "zambia": "ZM", "zambie": "ZM", "zmb": "ZM",
    "zimbabwe": "ZW", "zwe": "ZW",
    "uganda": "UG", "ouganda": "UG", "uga": "UG",
    "rwanda": "RW", "rwa": "RW",
    "ethiopia": "ET", "éthiopie": "ET", "eth": "ET",
    "somalia": "SO", "somalie": "SO", "som": "SO",
    "eritrea": "ER", "érythrée": "ER", "eri": "ER",
    "djibouti": "DJ", "dji": "DJ",
    "mauritania": "MR", "mauritanie": "MR", "mrt": "MR",
    "gambia": "GM", "gambie": "GM", "gmb": "GM",
    "guinea": "GN", "guinée": "GN", "gin": "GN",
    "guinea-bissau": "GW", "guinée-bissau": "GW", "gnb": "GW",
    "sierra leone": "SL", "sle": "SL",
    "liberia": "LR", "libéria": "LR", "lbr": "LR",
    "cape verde": "CV", "cap-vert": "CV", "cpv": "CV",
    "são tomé and príncipe": "ST", "sao tomé-et-príncipe": "ST", "stp": "ST",
    "comoros": "KM", "comores": "KM", "com": "KM",
    "seychelles": "SC", "syc": "SC",
}

# -- Incoterm normalisation map (lowercased keys → standard code) ------

INCOTERM_MAP: dict[str, str] = {
    "exw": "EXW", "ex works": "EXW", "départ usine": "EXW", "depart usine": "EXW",
    "fca": "FCA", "free carrier": "FCA", "franco transporteur": "FCA",
    "fob": "FOB", "free on board": "FOB", "franco à bord": "FOB", "franco a bord": "FOB",
    "cif": "CIF", "cost insurance freight": "CIF", "coût assurance fret": "CIF",
    "cfr": "CFR", "cost and freight": "CFR", "coût et fret": "CFR", "cout et fret": "CFR",
    "cpt": "CPT", "carriage paid to": "CPT", "port payé jusqu'à": "CPT", "port paye jusqu'a": "CPT",
    "cip": "CIP", "carriage insurance paid": "CIP", "port payé assurance comprise": "CIP",
    "dap": "DAP", "delivered at place": "DAP", "rendu au lieu": "DAP",
    "dpu": "DPU", "delivered at place unloaded": "DPU", "rendu au lieu déchargé": "DPU",
    "ddp": "DDP", "delivered duty paid": "DDP", "rendu droits acquittés": "DDP", "rendu droits acquittes": "DDP",
    "fas": "FAS", "free alongside ship": "FAS", "franco le long du navire": "FAS",
}

# -- French month names for date parsing ------

_FRENCH_MONTHS: dict[str, int] = {
    "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4,
    "mai": 5, "juin": 6, "juillet": 7, "août": 8, "aout": 8,
    "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12, "decembre": 12,
    "janv": 1, "févr": 2, "fevr": 2, "avr": 4, "juil": 7,
    "sept": 9, "oct": 10, "nov": 11, "déc": 12, "dec": 12,
}


def _normalize_country(value: Any, params: dict) -> str:
    """Normalize country name/code to ISO 3166-1 alpha-2."""
    if not value:
        return value
    s = str(value).strip()
    if not s:
        return value
    # Already a valid alpha-2 (2 uppercase letters)?
    if len(s) == 2 and s.isalpha():
        return s.upper()
    lookup = s.lower()
    result = COUNTRY_MAP.get(lookup)
    if result:
        return result
    # Try without accents
    norm = unicodedata.normalize("NFKD", lookup)
    norm = "".join(c for c in norm if not unicodedata.combining(c))
    result = COUNTRY_MAP.get(norm)
    return result if result else s


def _normalize_phone(value: Any, params: dict) -> str:
    """Clean phone number: remove formatting, detect/apply country code."""
    if not value:
        return value
    s = str(value).strip()
    if not s:
        return value
    default_code = params.get("default_country_code", "")
    # Remove spaces, dots, dashes, parentheses
    cleaned = re.sub(r"[\s.\-()]+", "", s)
    # If starts with + already, normalise
    if cleaned.startswith("+"):
        return cleaned
    # If starts with 00, convert to +
    if cleaned.startswith("00") and len(cleaned) > 4:
        return "+" + cleaned[2:]
    # Apply default country code if provided and number looks local
    if default_code and cleaned and not cleaned.startswith("+"):
        # Strip leading 0 if present (local number)
        if cleaned.startswith("0") and len(cleaned) > 1:
            cleaned = cleaned[1:]
        code = default_code if default_code.startswith("+") else "+" + default_code
        return code + cleaned
    return cleaned


def _between(value: Any, params: dict) -> str:
    """Extract substring between two delimiters."""
    if not value:
        return value
    s = str(value)
    start_delim = params.get("start", "")
    end_delim = params.get("end", "")
    start_idx = s.find(start_delim) + len(start_delim) if start_delim and start_delim in s else 0
    end_idx = s.find(end_delim, start_idx) if end_delim and end_delim in s[start_idx:] else len(s)
    return s[start_idx:end_idx].strip()


def _normalize_incoterm(value: Any, params: dict) -> str:
    """Normalize incoterm variations to standard codes."""
    if not value:
        return value
    s = str(value).strip()
    if not s:
        return value
    lookup = s.lower()
    result = INCOTERM_MAP.get(lookup)
    if result:
        return result
    # Try without accents
    norm = unicodedata.normalize("NFKD", lookup)
    norm = "".join(c for c in norm if not unicodedata.combining(c))
    result = INCOTERM_MAP.get(norm)
    return result if result else s.upper()  # fallback: uppercase as-is


def _parse_date_str(s: str, fmt: str = "auto") -> str | None:
    """Parse various date string formats to ISO YYYY-MM-DD.

    fmt: "auto" | "dd/mm/yyyy" | "mm/dd/yyyy"
    """
    s = s.strip()
    if not s:
        return None

    # Already ISO?
    iso_match = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", s)
    if iso_match:
        return s

    # Try DD/MM/YYYY or MM/DD/YYYY (slash, dash, dot separators)
    date_match = re.match(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$", s)
    if date_match:
        a, b, year = int(date_match.group(1)), int(date_match.group(2)), int(date_match.group(3))
        if fmt == "mm/dd/yyyy":
            month, day = a, b
        elif fmt == "dd/mm/yyyy":
            day, month = a, b
        else:
            # Auto: if first > 12, it's day; if second > 12, second is day
            if a > 12:
                day, month = a, b
            elif b > 12:
                month, day = a, b
            else:
                # Ambiguous — default to DD/MM/YYYY (European convention)
                day, month = a, b
        try:
            return date(year, month, day).isoformat()
        except ValueError:
            pass

    # Try DD/MM/YY or MM/DD/YY
    short_match = re.match(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$", s)
    if short_match:
        a, b = int(short_match.group(1)), int(short_match.group(2))
        yy = int(short_match.group(3))
        year = 2000 + yy if yy < 70 else 1900 + yy
        if fmt == "mm/dd/yyyy":
            month, day = a, b
        elif fmt == "dd/mm/yyyy":
            day, month = a, b
        else:
            if a > 12:
                day, month = a, b
            elif b > 12:
                month, day = a, b
            else:
                day, month = a, b
        try:
            return date(year, month, day).isoformat()
        except ValueError:
            pass

    # Try "20 mars 2026", "mars 2026", "20 March 2026", "March 20, 2026"
    lower = s.lower().replace(",", "")
    for month_name, month_num in _FRENCH_MONTHS.items():
        if month_name in lower:
            parts = lower.replace(month_name, "").split()
            nums = [int(p) for p in parts if p.isdigit()]
            if len(nums) == 2:
                day_val, year_val = (nums[0], nums[1]) if nums[1] > 31 else (nums[1], nums[0])
                try:
                    return date(year_val, month_num, day_val).isoformat()
                except ValueError:
                    pass
            break

    # Fallback: try dateutil
    if dateutil_parser:
        try:
            dayfirst = fmt != "mm/dd/yyyy"
            parsed = dateutil_parser.parse(s, dayfirst=dayfirst)
            return parsed.date().isoformat()
        except (ValueError, OverflowError):
            pass

    return s  # return unchanged if nothing matched


def _normalize_date(value: Any, params: dict) -> str:
    """Transform: parse various date formats to ISO YYYY-MM-DD."""
    if not value:
        return value
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, datetime):
        return value.date().isoformat()
    fmt = params.get("format", "auto")
    result = _parse_date_str(str(value), fmt)
    return result if result else value


def _normalize_datetime(value: Any, params: dict) -> str:
    """Transform: parse various date/time formats to ISO 8601."""
    if not value:
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day).isoformat()

    s = str(value).strip()
    fmt = params.get("format", "auto")

    # Try dateutil first for datetime (it handles time parts well)
    if dateutil_parser:
        try:
            dayfirst = fmt != "mm/dd/yyyy"
            parsed = dateutil_parser.parse(s, dayfirst=dayfirst)
            return parsed.isoformat()
        except (ValueError, OverflowError):
            pass

    # Fallback: try date-only parsing and append T00:00:00
    date_result = _parse_date_str(s, fmt)
    if date_result and date_result != s:
        return date_result + "T00:00:00"
    return s


TRANSFORM_REGISTRY: dict[str, Any] = {
    # -- Original transforms --
    "uppercase": lambda value, params: value.upper() if isinstance(value, str) else value,
    "lowercase": lambda value, params: value.lower() if isinstance(value, str) else value,
    "trim": lambda value, params: value.strip() if isinstance(value, str) else value,
    "default_value": lambda value, params: value if value else params.get("default", ""),
    "map_values": lambda value, params: params.get("mapping", {}).get(str(value), value),
    "concat": None,  # special handling — combines multiple columns
    "prefix": lambda value, params: f"{params.get('prefix', '')}{value}" if value else value,
    "suffix": lambda value, params: f"{value}{params.get('suffix', '')}" if value else value,
    "replace": lambda value, params: value.replace(params.get("find", ""), params.get("replace", "")) if isinstance(value, str) else value,
    "flag_to_boolean": lambda value, params: value in (params.get("true_values", ["X", "x", "1", "true", "True", "OUI", "oui", "Yes", "yes"])),
    "deduplicate_key": None,  # special handling — marks the dedup column
    "geocode": None,  # special handling — async geocoding
    "split": lambda value, params: value.split(params.get("separator", ","))[params.get("index", 0)].strip() if isinstance(value, str) and params.get("separator", ",") in value else value,
    # -- Advanced transforms --
    "normalize_country": _normalize_country,
    "normalize_phone": _normalize_phone,
    "normalize_incoterm": _normalize_incoterm,
    "normalize_date": _normalize_date,
    "normalize_datetime": _normalize_datetime,
    "trim_all": lambda value, params: " ".join(str(value).split()) if value else value,
    "left": lambda value, params: str(value)[:params.get("count", 0)] if value else value,
    "right": lambda value, params: str(value)[-params.get("count", 0):] if value and params.get("count", 0) else value,
    "mid": lambda value, params: str(value)[params.get("start", 0):params.get("start", 0) + params.get("length", 0)] if value else value,
    "between": _between,
}


def apply_transforms(rows: list[dict], transforms: list[dict], column_mapping: dict) -> list[dict]:
    """Apply transform pipeline to rows before import."""
    if not transforms:
        return rows

    result = list(rows)

    # Handle deduplicate_key first (groups rows)
    dedup_transforms = [t for t in transforms if t["type"] == "deduplicate_key"]
    if dedup_transforms:
        dedup_col = dedup_transforms[0]["column"]
        # Group by dedup column, take first non-empty value for each field
        grouped: dict[str, dict] = {}
        for row in result:
            key = row.get(dedup_col, "")
            if not key:
                continue
            if key not in grouped:
                grouped[key] = dict(row)
            else:
                # Merge: keep first non-empty value for each field
                for field, value in row.items():
                    if value and not grouped[key].get(field):
                        grouped[key][field] = value
        result = list(grouped.values())

    # Handle concat transforms
    concat_transforms = [t for t in transforms if t["type"] == "concat"]
    for ct in concat_transforms:
        source_cols = ct["params"].get("sources", [])
        separator = ct["params"].get("separator", " ")
        target = ct["column"]
        for row in result:
            parts = [str(row.get(s, "")) for s in source_cols if row.get(s)]
            row[target] = separator.join(parts)

    # Apply per-cell transforms
    cell_transforms = [t for t in transforms if t["type"] not in ("deduplicate_key", "concat", "geocode")]
    for row in result:
        for t in cell_transforms:
            col = t["column"]
            if col in row:
                fn = TRANSFORM_REGISTRY.get(t["type"])
                if fn:
                    row[col] = fn(row[col], t.get("params", {}))

    return result


# ── Public service functions ──────────────────────────────────────────────


def get_target_objects() -> list[TargetObjectInfo]:
    """Return all importable target objects with their field definitions."""
    return [
        TargetObjectInfo(key=h.key, label=h.label, fields=h.get_fields())
        for h in HANDLERS.values()
    ]


def auto_detect_mapping(
    target_object: str,
    file_headers: list[str],
) -> tuple[dict[str, str], dict[str, float]]:
    """Suggest column mapping by fuzzy-matching file headers to target fields.

    Returns (mapping, confidence) dicts keyed by file header.
    """
    handler = HANDLERS.get(target_object)
    if not handler:
        return {}, {}

    fields = handler.get_fields()
    field_keys = {f.key for f in fields}
    field_labels_norm = {_normalize(f.label): f.key for f in fields}
    field_keys_norm = {_normalize(f.key): f.key for f in fields}

    # Build reverse synonym map: normalized synonym -> field key
    synonym_map: dict[str, str] = {}
    for field_key, syns in FIELD_SYNONYMS.items():
        if field_key in field_keys:
            for syn in syns:
                synonym_map[_normalize(syn)] = field_key

    mapping: dict[str, str] = {}
    confidence: dict[str, float] = {}

    used_fields: set[str] = set()

    for header in file_headers:
        norm = _normalize(header)
        best_field: str | None = None
        best_score = 0.0

        # 1. Exact match on key
        if norm in field_keys_norm and field_keys_norm[norm] not in used_fields:
            best_field = field_keys_norm[norm]
            best_score = 1.0

        # 2. Exact match on label
        if not best_field and norm in field_labels_norm and field_labels_norm[norm] not in used_fields:
            best_field = field_labels_norm[norm]
            best_score = 0.95

        # 3. Synonym match
        if not best_field and norm in synonym_map and synonym_map[norm] not in used_fields:
            best_field = synonym_map[norm]
            best_score = 0.8

        # 4. Substring match
        if not best_field:
            for f in fields:
                fk_norm = _normalize(f.key)
                fl_norm = _normalize(f.label)
                if f.key in used_fields:
                    continue
                if fk_norm in norm or norm in fk_norm:
                    if len(fk_norm) > 2 and best_score < 0.6:
                        best_field = f.key
                        best_score = 0.6
                elif fl_norm in norm or norm in fl_norm:
                    if len(fl_norm) > 2 and best_score < 0.5:
                        best_field = f.key
                        best_score = 0.5

        if best_field:
            mapping[header] = best_field
            confidence[header] = best_score
            used_fields.add(best_field)

    return mapping, confidence


def _apply_mapping(row: dict[str, Any], column_mapping: dict[str, str]) -> dict[str, Any]:
    """Transform a file row using column_mapping: {file_col -> target_field}."""
    result: dict[str, Any] = {}
    for file_col, target_field in column_mapping.items():
        if file_col in row:
            result[target_field] = row[file_col]
    return result


async def validate_import(
    target_object: str,
    column_mapping: dict[str, str],
    rows: list[dict[str, Any]],
    duplicate_strategy: str,
    entity_id: UUID,
    db: AsyncSession,
    transforms: list[dict] | None = None,
) -> dict[str, Any]:
    """Validate rows without persisting. Returns preview response data."""
    handler = HANDLERS.get(target_object)
    if not handler:
        raise ValueError(f"Unknown target object: {target_object}")

    # Apply transforms pipeline
    if transforms:
        rows = apply_transforms(rows, transforms, column_mapping)

    all_errors: list[RowValidationError] = []
    preview_rows: list[dict[str, Any]] = []
    valid_count = 0
    dup_count = 0

    for i, raw_row in enumerate(rows):
        mapped = _apply_mapping(raw_row, column_mapping)
        mapped["__row_index"] = i

        row_errors = await handler.validate_row(mapped, entity_id, db)

        dup_id = await handler.find_duplicate(mapped, entity_id, db)
        if dup_id:
            dup_count += 1
            if duplicate_strategy == "fail":
                row_errors.append(RowValidationError(row_index=i, field="_duplicate", message="Doublon détecté"))

        if not any(e.severity == "error" for e in row_errors):
            valid_count += 1

        all_errors.extend(row_errors)
        preview_rows.append(mapped)

    error_count = sum(1 for e in all_errors if e.severity == "error")
    warning_count = sum(1 for e in all_errors if e.severity == "warning")

    return {
        "valid_count": valid_count,
        "error_count": error_count,
        "warning_count": warning_count,
        "duplicate_count": dup_count,
        "errors": all_errors,
        "preview_rows": preview_rows[:100],
    }


async def execute_import(
    target_object: str,
    column_mapping: dict[str, str],
    rows: list[dict[str, Any]],
    duplicate_strategy: str,
    entity_id: UUID,
    user_id: UUID,
    db: AsyncSession,
    transforms: list[dict] | None = None,
    max_rows: int | None = None,
) -> dict[str, Any]:
    """Execute the import: create/update/skip records."""
    handler = HANDLERS.get(target_object)
    if not handler:
        raise ValueError(f"Unknown target object: {target_object}")

    # Apply transforms pipeline
    if transforms:
        rows = apply_transforms(rows, transforms, column_mapping)

    created = 0
    updated = 0
    skipped = 0
    errors: list[RowValidationError] = []

    for i, raw_row in enumerate(rows):
        # Stop if max_rows limit reached (count only successfully created/updated)
        if max_rows is not None and (created + updated) >= max_rows:
            skipped += len(rows) - i
            break

        mapped = _apply_mapping(raw_row, column_mapping)
        mapped["__row_index"] = i

        try:
            # Validate
            row_errors = await handler.validate_row(mapped, entity_id, db)
            hard_errors = [e for e in row_errors if e.severity == "error"]
            if hard_errors:
                errors.extend(hard_errors)
                skipped += 1
                continue

            # Check duplicate
            dup_id = await handler.find_duplicate(mapped, entity_id, db)
            if dup_id:
                if duplicate_strategy == "skip":
                    skipped += 1
                    continue
                elif duplicate_strategy == "update":
                    await handler.update_record(dup_id, mapped, user_id, db)
                    updated += 1
                    continue
                elif duplicate_strategy == "fail":
                    errors.append(RowValidationError(row_index=i, field="_duplicate", message="Doublon détecté"))
                    skipped += 1
                    continue

            # Create
            await handler.create_record(mapped, entity_id, user_id, db)
            created += 1

        except Exception as exc:
            logger.warning("Import row %d failed: %s", i, exc)
            errors.append(RowValidationError(row_index=i, field="_system", message=str(exc)))
            skipped += 1

    await db.commit()
    logger.info(
        "Import %s: %d created, %d updated, %d skipped, %d errors",
        target_object, created, updated, skipped, len(errors),
    )

    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
        "total_processed": len(rows),
    }
