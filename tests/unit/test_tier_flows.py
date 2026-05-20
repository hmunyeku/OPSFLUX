"""Tests de validation Tier flows — Pydantic schemas + tier_guard service.

Complete `test_tier_contact_promotion.py` (qui couvre uniquement la
promotion contact→user). Couvre :
  - validation schemas : TierCreate, TierContactCreate, TierUpdate,
    TierBlockCreate, AddressCreate (alias zip_code), LegalIdentifierCreate
  - service tier_guard : ensure_tier_usable raise correctement
    TIER_NOT_FOUND / TIER_INACTIVE / TIER_BLOCKED

Pattern : Pydantic validation directe + FakeDB mock (memes mocks que
test_tier_contact_promotion.py). Pas de Postgres, deterministe, rapide.
"""
from __future__ import annotations

from datetime import date, timedelta
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.core.errors import StructuredHTTPException
from app.models.common import AuditLog, Tier, TierBlock, User
from app.schemas.common import (
    AddressCreate,
    LegalIdentifierCreate,
    TierBlockCreate,
    TierContactCreate,
    TierCreate,
    TierUpdate,
)
from app.services.core.audit_service import add_event as add_audit_event
from app.services.modules.tier_guard import ensure_tier_usable


# ─── FakeDB minimal (compat avec test_tier_contact_promotion.py) ─────────


class FakeResult:
    def __init__(self, *, scalar_one_or_none=None):
        self._v = scalar_one_or_none

    def scalar_one_or_none(self):
        return self._v


class FakeDB:
    """Minimal AsyncSession mock for tier_guard / audit tests."""

    def __init__(self, block_result=None):
        self._block_result = block_result
        self.added: list = []

    async def execute(self, statement, params=None):
        return FakeResult(scalar_one_or_none=self._block_result)

    def add(self, obj):
        self.added.append(obj)


# ─── TierCreate ──────────────────────────────────────────────────────────


def test_tier_create_rejects_empty_name():
    with pytest.raises(ValidationError):
        TierCreate.model_validate({"name": ""})


def test_tier_create_rejects_name_over_200_chars():
    with pytest.raises(ValidationError):
        TierCreate.model_validate({"name": "X" * 201})


def test_tier_create_rejects_negative_capital():
    # Bug #99 (QA v3 round 4)
    with pytest.raises(ValidationError):
        TierCreate.model_validate({"name": "Acme", "capital": -1})


def test_tier_create_accepts_minimal_payload():
    payload = TierCreate.model_validate({"name": "Acme Corp"})
    assert payload.name == "Acme Corp"
    assert payload.scope == "local"  # default
    assert payload.fiscal_year_start == 1  # default
    assert payload.contacts == []  # default factory


def test_tier_create_accepts_initial_contacts():
    payload = TierCreate.model_validate(
        {
            "name": "Acme",
            "contacts": [
                {"first_name": "Jean", "last_name": "Dupont"},
                {"first_name": "Marie", "last_name": "Martin", "is_primary": True},
            ],
        }
    )
    assert len(payload.contacts) == 2
    assert payload.contacts[1].is_primary is True


# ─── TierUpdate ──────────────────────────────────────────────────────────


def test_tier_update_rejects_unknown_field():
    # Bug #132 (QA v3 round 10) : extra="forbid" — pas de silent-drop
    # de champs immuables (id, code, entity_id, ...) ni de typos.
    with pytest.raises(ValidationError):
        TierUpdate.model_validate({"code": "TIR-HACKED"})


def test_tier_update_accepts_partial():
    payload = TierUpdate.model_validate({"name": "Renamed"})
    assert payload.name == "Renamed"


# ─── TierContactCreate ───────────────────────────────────────────────────


def test_tier_contact_create_rejects_empty_first_name():
    with pytest.raises(ValidationError):
        TierContactCreate.model_validate({"first_name": "", "last_name": "Dupont"})


def test_tier_contact_create_rejects_invalid_email():
    # Bug #142 (QA v3 round 38) : EmailStr enforce RFC
    with pytest.raises(ValidationError):
        TierContactCreate.model_validate(
            {"first_name": "Jean", "last_name": "Dupont", "email": "pas-un-email"}
        )


def test_tier_contact_create_accepts_valid_email():
    payload = TierContactCreate.model_validate(
        {"first_name": "Jean", "last_name": "Dupont", "email": "jean@example.com"}
    )
    assert payload.email == "jean@example.com"


# ─── TierBlockCreate ─────────────────────────────────────────────────────


def test_tier_block_create_rejects_empty_reason():
    with pytest.raises(ValidationError):
        TierBlockCreate.model_validate({"reason": ""})


def test_tier_block_create_rejects_invalid_block_type():
    # Pattern: ^(purchasing|payment|all)$
    with pytest.raises(ValidationError):
        TierBlockCreate.model_validate(
            {"reason": "Controle", "block_type": "n-imp-quoi"}
        )


def test_tier_block_create_defaults_to_purchasing():
    payload = TierBlockCreate.model_validate({"reason": "Audit fournisseur"})
    assert payload.block_type == "purchasing"


# ─── AddressCreate (alias zip_code / is_primary) ─────────────────────────


def test_address_create_accepts_zip_code_alias():
    """populate_by_name=True : zip_code maps to postal_code, is_primary to is_default.

    Documente la résolution partielle de la dette de cohérence Address :
    l'API accepte le naming legacy (zip_code/is_primary) sans 422.
    """
    payload = AddressCreate.model_validate(
        {
            "owner_type": "tier",
            "owner_id": str(uuid4()),
            "label": "HQ",
            "address_line1": "1 rue de Paris",
            "city": "Paris",
            "country": "FR",
            "zip_code": "75001",
            "is_primary": True,
        }
    )
    assert payload.postal_code == "75001"
    assert payload.is_default is True


def test_address_create_accepts_canonical_names():
    payload = AddressCreate.model_validate(
        {
            "owner_type": "tier",
            "owner_id": str(uuid4()),
            "label": "HQ",
            "address_line1": "1 rue de Paris",
            "city": "Paris",
            "country": "FR",
            "postal_code": "75001",
            "is_default": True,
        }
    )
    assert payload.postal_code == "75001"
    assert payload.is_default is True


def test_address_create_rejects_missing_required():
    with pytest.raises(ValidationError):
        AddressCreate.model_validate(
            {"owner_type": "tier", "owner_id": str(uuid4())}
        )  # missing label/address_line1/city/country


# ─── LegalIdentifierCreate ───────────────────────────────────────────────


def test_legal_identifier_create_rejects_empty_value():
    with pytest.raises(ValidationError):
        LegalIdentifierCreate.model_validate({"type": "SIREN", "value": ""})


# ─── tier_guard.ensure_tier_usable ───────────────────────────────────────


@pytest.mark.asyncio
async def test_ensure_tier_usable_raises_on_none():
    db = FakeDB()
    with pytest.raises(StructuredHTTPException) as exc:
        await ensure_tier_usable(db, None, entity_id=uuid4(), operation="test")
    assert exc.value.status_code == 404
    assert exc.value.code == "TIER_NOT_FOUND"


@pytest.mark.asyncio
async def test_ensure_tier_usable_raises_on_archived():
    db = FakeDB()
    tier = Tier(
        id=uuid4(),
        entity_id=uuid4(),
        code="TIR-X",
        name="Archived Co",
        active=True,
    )
    tier.archived = True  # type: ignore[attr-defined]
    with pytest.raises(StructuredHTTPException) as exc:
        await ensure_tier_usable(
            db, tier, entity_id=tier.entity_id, operation="purchase"
        )
    assert exc.value.status_code == 400
    assert exc.value.code == "TIER_INACTIVE"


@pytest.mark.asyncio
async def test_ensure_tier_usable_raises_on_blocked():
    entity_id = uuid4()
    tier = Tier(
        id=uuid4(), entity_id=entity_id, code="TIR-Y", name="Blocked Co", active=True
    )
    tier.archived = False  # type: ignore[attr-defined]
    block = TierBlock(
        id=uuid4(),
        entity_id=entity_id,
        tier_id=tier.id,
        action="block",
        reason="Audit en cours",
        block_type="purchasing",
        start_date=date.today() - timedelta(days=1),
        end_date=date.today() + timedelta(days=30),
        active=True,
        performed_by=uuid4(),
    )
    db = FakeDB(block_result=block)
    with pytest.raises(StructuredHTTPException) as exc:
        await ensure_tier_usable(
            db, tier, entity_id=entity_id, operation="create_order"
        )
    assert exc.value.status_code == 409
    assert exc.value.code == "TIER_BLOCKED"
    assert exc.value.code_params["block_type"] == "purchasing"
    assert exc.value.code_params["operation"] == "create_order"


@pytest.mark.asyncio
async def test_ensure_tier_usable_passes_on_active_unblocked():
    entity_id = uuid4()
    tier = Tier(
        id=uuid4(), entity_id=entity_id, code="TIR-Z", name="Healthy Co", active=True
    )
    tier.archived = False  # type: ignore[attr-defined]
    db = FakeDB(block_result=None)  # no block returned
    # Should not raise
    await ensure_tier_usable(db, tier, entity_id=entity_id, operation="any")


# ─── audit_service.add_event ─────────────────────────────────────────────


def test_audit_add_event_attaches_row_to_session():
    db = FakeDB()
    user = User(id=uuid4(), email="audit@test.com", first_name="A", last_name="U")
    entity_id = uuid4()
    tier_id = uuid4()
    log = add_audit_event(
        db,
        user=user,
        entity_id=entity_id,
        action="block",
        resource_type="tier",
        resource_id=tier_id,
        details={"reason": "Audit fournisseur", "block_type": "purchasing"},
    )
    assert isinstance(log, AuditLog)
    assert len(db.added) == 1
    assert db.added[0] is log
    assert log.action == "block"
    assert log.resource_type == "tier"
    assert log.resource_id == str(tier_id)  # UUID coerced to str
    assert log.user_id == user.id
    assert log.entity_id == entity_id
    assert log.details == {"reason": "Audit fournisseur", "block_type": "purchasing"}
    assert log.ip_address is None  # no request passed
    assert log.user_agent is None


def test_audit_add_event_handles_none_user_and_no_details():
    db = FakeDB()
    log = add_audit_event(
        db,
        user=None,  # system / unauthenticated event
        entity_id=None,
        action="cleanup",
        resource_type="tier",
        resource_id=None,
    )
    assert log.user_id is None
    assert log.entity_id is None
    assert log.resource_id is None
    assert log.details is None  # empty dict normalised to None
