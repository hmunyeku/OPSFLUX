from datetime import date, datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from app.services.connectors.compliance_connector import ExternalComplianceRecord
from app.services.modules.compliance_external_verification import apply_external_certificate_result


def test_apply_external_certificate_result_updates_record_metadata() -> None:
    checked_at = datetime(2026, 5, 21, 9, 30, tzinfo=timezone.utc)
    checked_by = uuid4()
    record = SimpleNamespace(
        title=None,
        issued_at=None,
        expires_at=None,
        status="pending",
        verification_status="pending",
        verified_by=None,
        verified_at=None,
        external_verification_provider=None,
        external_verification_id=None,
        external_verification_checked_at=None,
        external_verification_payload=None,
    )
    external = ExternalComplianceRecord(
        external_id="cert:42:user:9001",
        user_external_id="9001",
        type_external_id="42",
        status="valid",
        title="ATEX niveau 1 - recyclage 2026",
        issued_at=date(2026, 1, 10),
        expires_at=date(2027, 1, 10),
        extra={"riseup_state": "certified"},
    )

    apply_external_certificate_result(
        record,
        external,
        provider_id="riseup",
        checked_by=checked_by,
        checked_at=checked_at,
    )

    assert record.title == "ATEX niveau 1 - recyclage 2026"
    assert record.issued_at == datetime(2026, 1, 10, tzinfo=timezone.utc)
    assert record.expires_at == datetime(2027, 1, 10, tzinfo=timezone.utc)
    assert record.status == "valid"
    assert record.verification_status == "verified"
    assert record.verified_by == checked_by
    assert record.verified_at == checked_at
    assert record.external_verification_provider == "riseup"
    assert record.external_verification_id == "cert:42:user:9001"
    assert record.external_verification_checked_at == checked_at
    assert record.external_verification_payload == {
        "external_id": "cert:42:user:9001",
        "user_external_id": "9001",
        "type_external_id": "42",
        "status": "valid",
        "title": "ATEX niveau 1 - recyclage 2026",
        "issued_at": "2026-01-10",
        "expires_at": "2027-01-10",
        "score": None,
        "progress": None,
        "extra": {"riseup_state": "certified"},
    }
