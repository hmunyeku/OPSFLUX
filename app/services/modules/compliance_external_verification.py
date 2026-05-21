"""External certificate verification helpers for compliance records."""

from datetime import date, datetime, time, timezone
from typing import Any
from uuid import UUID

from app.services.connectors.compliance_connector import ExternalComplianceRecord


def _as_utc_datetime(value: date | datetime | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return datetime.combine(value, time.min, tzinfo=timezone.utc)


def _serialize_date(value: date | datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def external_record_payload(external: ExternalComplianceRecord) -> dict[str, Any]:
    return {
        "external_id": external.external_id,
        "user_external_id": external.user_external_id,
        "type_external_id": external.type_external_id,
        "status": external.status,
        "title": external.title,
        "issued_at": _serialize_date(external.issued_at),
        "expires_at": _serialize_date(external.expires_at),
        "score": external.score,
        "progress": external.progress,
        "extra": external.extra,
    }


def apply_external_certificate_result(
    record: Any,
    external: ExternalComplianceRecord,
    *,
    provider_id: str,
    checked_by: UUID,
    checked_at: datetime | None = None,
) -> None:
    """Apply a trusted external certificate response to a local record."""
    checked_at = checked_at or datetime.now(timezone.utc)
    status = external.status if external.status in {"valid", "expired", "pending", "rejected"} else "pending"

    if external.title:
        record.title = external.title
    if external.issued_at is not None:
        record.issued_at = _as_utc_datetime(external.issued_at)
    if external.expires_at is not None:
        record.expires_at = _as_utc_datetime(external.expires_at)

    record.status = status
    if status in {"valid", "expired"}:
        record.verification_status = "verified"
        record.verified_by = checked_by
        record.verified_at = checked_at
        record.rejection_reason = None
    elif status == "rejected":
        record.verification_status = "rejected"
    else:
        record.verification_status = "pending"

    record.external_verification_provider = provider_id
    record.external_verification_id = external.external_id
    record.external_verification_checked_at = checked_at
    record.external_verification_payload = external_record_payload(external)
