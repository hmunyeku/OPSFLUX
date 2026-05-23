from app.services.modules.compliance_audit_scoring import (
    classify_audit_score,
    normalize_audit_score_thresholds,
)


def test_score_thresholds_are_normalized_for_supplier_categories():
    thresholds = normalize_audit_score_thresholds([
        {"code": "qualified", "label": "Qualified", "min_score": 75},
        {"code": "blocked", "label": "Blocked", "min_score": 0, "blocks_assignment": True},
        {"code": "preferred", "label": "Preferred", "min_score": 90},
    ])

    assert [item["code"] for item in thresholds] == ["preferred", "qualified", "blocked"]
    assert thresholds[0]["min_score"] == 90
    assert thresholds[-1]["blocks_assignment"] is True


def test_score_classification_uses_highest_matching_threshold():
    thresholds = normalize_audit_score_thresholds([
        {"code": "preferred", "label": "Preferred", "min_score": 90},
        {"code": "qualified", "label": "Qualified", "min_score": 75},
        {"code": "watch", "label": "Watch", "min_score": 60},
        {"code": "blocked", "label": "Blocked", "min_score": 0, "blocks_assignment": True},
    ])

    assert classify_audit_score(91, thresholds)["code"] == "preferred"
    assert classify_audit_score(75, thresholds)["code"] == "qualified"
    assert classify_audit_score(62, thresholds)["code"] == "watch"
    assert classify_audit_score(12, thresholds)["blocks_assignment"] is True
    assert classify_audit_score(None, thresholds) is None
