"""
External Compliance Connector — generic framework for fetching compliance data
from external systems (RiseUp, Intranet Medical, custom APIs).

Architecture:
    ComplianceConnector (abstract base)
      ├── RiseUpConnector — Rise Up LMS (formations, certifications)
      ├── IntranetMedicalConnector — Intranet medical checks
      └── ... (future connectors)

Admin configures per ComplianceType:
    source = "opsflux" | "external" | "both"
    external_provider = "riseup" | "intranet_medical" | ...
    external_mapping = { "certificate_id": 42 }  (maps OpsFlux type → external ID)

check_compliance uses this to decide whether to check local DB, external API, or both.
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date
from typing import Any

logger = logging.getLogger(__name__)


# ── Data classes for connector results ──────────────────────────────


@dataclass
class ExternalComplianceRecord:
    """A compliance record from an external system."""

    external_id: str
    user_external_id: str  # ID in the external system (rhid, email, etc.)
    type_external_id: str  # Certificate/training ID in external system
    status: str  # "valid" | "expired" | "pending" | "missing"
    title: str = ""
    issued_at: date | None = None
    expires_at: date | None = None
    score: int | None = None
    progress: int | None = None  # 0-100
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class ExternalUserMatch:
    """Result of matching an OpsFlux user to an external system user."""

    external_user_id: str
    matched_by: str  # "email" | "rhid" | "intranet_id"
    external_name: str = ""


# ── Abstract base connector ─────────────────────────────────────────


class ComplianceConnector(ABC):
    """Abstract base class for external compliance data sources."""

    provider_id: str = ""  # e.g. "riseup", "intranet_medical"
    provider_name: str = ""  # Human-readable name

    @abstractmethod
    async def authenticate(self) -> None:
        """Authenticate with the external API. Called before any data fetch."""
        ...

    @abstractmethod
    async def test_connection(self) -> tuple[str, str]:
        """Test connectivity. Returns (status, message) — 'ok'/'error'."""
        ...

    @abstractmethod
    async def match_user(self, email: str, intranet_id: str | None = None) -> ExternalUserMatch | None:
        """Find the external system user matching this OpsFlux user."""
        ...

    @abstractmethod
    async def get_user_compliance(
        self,
        external_user_id: str,
        type_mapping: dict[str, str] | None = None,
    ) -> list[ExternalComplianceRecord]:
        """Fetch all compliance records for a user from the external system.

        Args:
            external_user_id: The user's ID in the external system.
            type_mapping: Optional {opsflux_type_id: external_type_id} to filter.

        Returns:
            List of compliance records found in the external system.
        """
        ...

    @abstractmethod
    async def get_certificate_status(
        self,
        external_user_id: str,
        external_certificate_id: str,
    ) -> ExternalComplianceRecord | None:
        """Check a specific certificate/training status for a user."""
        ...


# ── Connector registry ──────────────────────────────────────────────

_CONNECTORS: dict[str, type[ComplianceConnector]] = {}


def register_compliance_connector(provider_id: str):
    """Decorator to register a compliance connector class."""

    def decorator(cls: type[ComplianceConnector]):
        cls.provider_id = provider_id
        _CONNECTORS[provider_id] = cls
        return cls

    return decorator


def get_connector_class(provider_id: str) -> type[ComplianceConnector] | None:
    """Get a registered connector class by provider ID."""
    return _CONNECTORS.get(provider_id)


def list_connectors() -> list[str]:
    """List all registered compliance connector provider IDs."""
    return list(_CONNECTORS.keys())


async def create_connector(provider_id: str, settings: dict[str, str]) -> ComplianceConnector | None:
    """Create and authenticate a connector instance from settings."""
    cls = get_connector_class(provider_id)
    if not cls:
        logger.error("Unknown compliance connector: %s", provider_id)
        return None

    try:
        connector = cls(settings)
        await connector.authenticate()
        return connector
    except Exception:
        logger.exception("Failed to create %s connector", provider_id)
        return None
