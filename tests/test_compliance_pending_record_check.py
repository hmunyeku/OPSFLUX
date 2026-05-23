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


@pytest.mark.asyncio
async def test_company_tag_rule_applies_to_tagged_tier(db_session, sample_entity, sample_user):
    from app.models.common import ComplianceRule, ComplianceType, Tag, Tier
    from app.services.modules.compliance_service import check_owner_compliance

    tier = Tier(
        entity_id=sample_entity.id,
        name="QA Tagged Contractor",
        code="QA-TAGGED",
        type="subcontractor",
        active=True,
    )
    db_session.add(tier)
    await db_session.flush()

    db_session.add(Tag(
        owner_type="tier",
        owner_id=tier.id,
        name="critical-supplier",
        color="#ef4444",
        visibility="public",
        created_by=sample_user.id,
    ))

    compliance_type = ComplianceType(
        entity_id=sample_entity.id,
        code="QA-AUDIT-HSE",
        name="Audit HSE fournisseur",
        category="audit",
        active=True,
    )
    db_session.add(compliance_type)
    await db_session.flush()

    db_session.add(ComplianceRule(
        entity_id=sample_entity.id,
        compliance_type_id=compliance_type.id,
        subject_scope="company",
        target_type="tier_tag",
        target_value="critical-supplier",
        applicability="permanent",
        active=True,
    ))
    await db_session.flush()

    verdict = await check_owner_compliance(
        db_session,
        entity_id=sample_entity.id,
        owner_type="tier",
        owner_id=tier.id,
    )

    assert verdict["total_required"] == 1
    assert verdict["total_missing"] == 1
    assert verdict["details"][0]["compliance_type_id"] == str(compliance_type.id)


@pytest.mark.asyncio
async def test_person_tag_rule_applies_to_tagged_contact(db_session, sample_entity, sample_user):
    from app.models.common import ComplianceRule, ComplianceType, Tag, Tier, TierContact
    from app.services.modules.compliance_service import check_owner_compliance

    tier = Tier(
        entity_id=sample_entity.id,
        name="QA People Contractor",
        code="QA-PEOPLE",
        type="subcontractor",
        active=True,
    )
    db_session.add(tier)
    await db_session.flush()

    contact = TierContact(
        tier_id=tier.id,
        first_name="Patrick",
        last_name="ABE",
        email="patrick.abe.tagged@example.test",
        active=True,
    )
    db_session.add(contact)
    await db_session.flush()

    db_session.add(Tag(
        owner_type="tier_contact",
        owner_id=contact.id,
        name="offshore",
        color="#3b82f6",
        visibility="public",
        created_by=sample_user.id,
    ))

    compliance_type = ComplianceType(
        entity_id=sample_entity.id,
        code="QA-BOSIET",
        name="BOSIET",
        category="formation",
        active=True,
    )
    db_session.add(compliance_type)
    await db_session.flush()

    db_session.add(ComplianceRule(
        entity_id=sample_entity.id,
        compliance_type_id=compliance_type.id,
        subject_scope="person",
        target_type="person_tag",
        target_value="offshore",
        applicability="permanent",
        active=True,
    ))
    await db_session.flush()

    verdict = await check_owner_compliance(
        db_session,
        entity_id=sample_entity.id,
        owner_type="tier_contact",
        owner_id=contact.id,
    )

    assert verdict["total_required"] == 1
    assert verdict["total_missing"] == 1
    assert verdict["details"][0]["compliance_type_id"] == str(compliance_type.id)
