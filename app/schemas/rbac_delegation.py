"""Pydantic schemas for RBAC delegations."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import OpsFluxSchema


class DelegationCreate(BaseModel):
    """Payload to create a delegation. Server-side validates:
    - Delegator has all listed permissions effectively (not via delegation)
    - Duration <= max_duration_days setting
    - end_date > start_date
    """
    delegate_id: UUID
    permissions: list[str] = Field(..., min_length=1, max_length=200)
    start_date: datetime
    end_date: datetime
    reason: str = Field(..., min_length=10, max_length=500, description="ISO traceability — required")


class DelegationUpdate(BaseModel):
    """Patch a delegation (delegator or manager only).
    Only `reason` and `end_date` (shorten only) are mutable.
    """
    reason: str | None = Field(None, min_length=10, max_length=500)
    end_date: datetime | None = None


class DelegationRevoke(BaseModel):
    """Revoke a delegation."""
    reason: str = Field(..., min_length=5, max_length=500)


class DelegationRead(OpsFluxSchema):
    id: UUID
    delegator_id: UUID
    delegate_id: UUID
    entity_id: UUID
    permissions: list[str]
    start_date: datetime
    end_date: datetime
    active: bool
    reason: str | None
    created_at: datetime
    # Derived fields
    delegator_name: str | None = None
    delegate_name: str | None = None
    status: str = "active"  # active | programmed | expired | revoked
    duration_days: int = 0


class DelegationListItem(OpsFluxSchema):
    id: UUID
    delegator_name: str
    delegate_name: str
    permissions_count: int
    start_date: datetime
    end_date: datetime
    status: str
    reason: str | None
