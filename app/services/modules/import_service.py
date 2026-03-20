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

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.references import generate_reference
from app.models.common import (
    Asset,
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
    # Asset
    "parent_code": ["code_parent", "parent", "parent_ref", "asset_parent"],
    "latitude": ["lat", "gps_lat"],
    "longitude": ["lng", "lon", "gps_lng", "gps_lon"],
    "max_pax": ["capacite_pax", "pax_capacity", "nb_pax_max"],
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
            TargetFieldDef(key="type", label="Type", type="string", required=True, example="platform"),
            TargetFieldDef(key="name", label="Nom", type="string", required=True, example="PF-Alpha"),
            TargetFieldDef(key="code", label="Code", type="string", example="AST-2026-0001"),
            TargetFieldDef(key="parent_code", label="Code parent", type="lookup", lookup_target="asset.code"),
            TargetFieldDef(key="latitude", label="Latitude", type="float", example="4.0511"),
            TargetFieldDef(key="longitude", label="Longitude", type="float", example="9.7679"),
            TargetFieldDef(key="max_pax", label="Capacité PAX", type="integer", example="120"),
            TargetFieldDef(key="active", label="Actif", type="boolean", example="oui"),
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
                select(Asset.id).where(Asset.entity_id == entity_id, Asset.code == str(row["parent_code"]).strip())
            )
            if not parent.scalar_one_or_none():
                errors.append(RowValidationError(row_index=idx, field="parent_code", message=f"Parent inconnu: {row['parent_code']}", severity="warning"))
        return errors

    async def find_duplicate(self, row: dict[str, Any], entity_id: UUID, db: AsyncSession) -> UUID | None:
        code = row.get("code")
        if not code:
            return None
        result = await db.execute(select(Asset.id).where(Asset.entity_id == entity_id, Asset.code == str(code).strip()))
        return result.scalar_one_or_none()

    async def create_record(self, row: dict[str, Any], entity_id: UUID, user_id: UUID, db: AsyncSession) -> UUID:
        code = row.get("code")
        if not code:
            code = await generate_reference("AST", db, entity_id=entity_id)
        parent_id = None
        if row.get("parent_code"):
            res = await db.execute(select(Asset.id).where(Asset.entity_id == entity_id, Asset.code == str(row["parent_code"]).strip()))
            parent_id = res.scalar_one_or_none()
        obj = Asset(
            entity_id=entity_id,
            type=str(row.get("type", "")).strip(),
            code=str(code).strip(),
            name=str(row.get("name", "")).strip(),
            parent_id=parent_id,
            latitude=_safe_float(row.get("latitude")),
            longitude=_safe_float(row.get("longitude")),
            max_pax=_safe_int(row.get("max_pax")),
            active=_safe_bool(row.get("active")) if row.get("active") is not None else True,
        )
        db.add(obj)
        await db.flush()
        return obj.id

    async def update_record(self, record_id: UUID, row: dict[str, Any], user_id: UUID, db: AsyncSession) -> None:
        result = await db.execute(select(Asset).where(Asset.id == record_id))
        obj = result.scalar_one()
        if row.get("name"):
            obj.name = str(row["name"]).strip()
        if row.get("type"):
            obj.type = str(row["type"]).strip()
        if row.get("latitude") is not None:
            obj.latitude = _safe_float(row["latitude"])
        if row.get("longitude") is not None:
            obj.longitude = _safe_float(row["longitude"])
        if row.get("max_pax") is not None:
            obj.max_pax = _safe_int(row["max_pax"])
        if row.get("active") is not None:
            val = _safe_bool(row["active"])
            if val is not None:
                obj.active = val


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
        code = row.get("code")
        if not code:
            return None
        result = await db.execute(select(Tier.id).where(Tier.entity_id == entity_id, Tier.code == str(code).strip()))
        return result.scalar_one_or_none()

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
            description=str(row.get("description", "")).strip() or None,
            active=_safe_bool(row.get("active")) if row.get("active") is not None else True,
        )
        db.add(obj)
        await db.flush()
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
            r = await db.execute(select(Asset.id).where(Asset.entity_id == entity_id, Asset.code == owner_code))
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


# ── Transform engine ──────────────────────────────────────────────────────


TRANSFORM_REGISTRY: dict[str, Any] = {
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
