from uuid import uuid4

from app.schemas.common import ComplianceRuleCreate


def test_compliance_rule_create_keeps_subject_scope() -> None:
    rule = ComplianceRuleCreate(
        compliance_type_id=uuid4(),
        subject_scope="company",
        target_type="tier_type",
        target_value="supplier",
    )

    assert rule.subject_scope == "company"


def test_owner_subject_scope_distinguishes_people_and_companies() -> None:
    from app.services.modules.compliance_service import _owner_subject_scope

    assert _owner_subject_scope("tier_contact") == "person"
    assert _owner_subject_scope("user") == "person"
    assert _owner_subject_scope("tier") == "company"
    assert _owner_subject_scope("asset") == "asset"
