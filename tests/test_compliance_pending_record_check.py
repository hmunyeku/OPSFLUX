import pytest
from datetime import datetime, timezone


@pytest.mark.asyncio
async def test_pending_compliance_record_is_unverified_not_missing(db_session, sample_entity, sample_user):
    from app.models.common import ComplianceRecord, ComplianceRule, ComplianceType, Tier, TierContact
    from app.services.modules.compliance_service import check_owner_compliance

    tier = Tier(
        entity_id=sample_entity.id,
        name="QA Compliance Contractor",
        code="QA-COMP-CONTRACTOR",
        type="subcontractor",
        active=True,
    )
    db_session.add(tier)
    await db_session.flush()

    contact = TierContact(
        tier_id=tier.id,
        first_name="Patrick",
        last_name="ABE",
        email="patrick.abe.qa@example.test",
        active=True,
    )
    db_session.add(contact)
    await db_session.flush()

    compliance_type = ComplianceType(
        entity_id=sample_entity.id,
        code="QA-H0B0",
        name="Habilitation Electrique H0B0",
        category="habilitation",
        active=True,
    )
    db_session.add(compliance_type)
    await db_session.flush()

    rule = ComplianceRule(
        entity_id=sample_entity.id,
        compliance_type_id=compliance_type.id,
        target_type="all",
        applicability="permanent",
        active=True,
    )
    db_session.add(rule)
    await db_session.flush()

    before = await check_owner_compliance(
        db_session,
        entity_id=sample_entity.id,
        owner_type="tier_contact",
        owner_id=contact.id,
    )
    assert before["total_missing"] == 1
    assert before["total_unverified"] == 0
    assert before["details"][0]["status"] == "missing"

    record = ComplianceRecord(
        entity_id=sample_entity.id,
        compliance_type_id=compliance_type.id,
        owner_type="tier_contact",
        owner_id=contact.id,
        status="pending",
        verification_status="pending",
        issued_at=datetime.now(timezone.utc),
        issuer="Centre QA",
        reference_number="QA-PENDING-001",
        created_by=sample_user.id,
        active=True,
    )
    db_session.add(record)
    await db_session.flush()

    after = await check_owner_compliance(
        db_session,
        entity_id=sample_entity.id,
        owner_type="tier_contact",
        owner_id=contact.id,
    )

    assert after["total_missing"] == 0
    assert after["total_unverified"] == 1
    assert after["is_compliant"] is False
    assert after["details"][0]["status"] == "unverified"
