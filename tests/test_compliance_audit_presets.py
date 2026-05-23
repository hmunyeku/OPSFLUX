from app.services.modules.compliance_audit_presets import (
    get_audit_template_preset,
    list_audit_template_presets,
    missing_audit_template_preset_codes,
)


def test_cis_audit_presets_cover_the_three_field_reports():
    presets = list_audit_template_presets()
    codes = {preset["code"] for preset in presets}

    assert {
        "CIS-AUDIT-ADMIN",
        "CIS-AUDIT-HSE",
        "CIS-AUDIT-METIER",
    }.issubset(codes)

    hse = get_audit_template_preset("CIS-AUDIT-HSE")
    assert hse is not None
    assert hse["target_scope"] == "company"
    assert hse["passing_score"] == 75
    assert len(hse["themes"]) >= 8
    assert sum(len(theme["questions"]) for theme in hse["themes"]) >= 25

    metier = get_audit_template_preset("CIS-AUDIT-METIER")
    assert metier is not None
    assert metier["passing_score"] == 60
    assert any(theme["title"] == "Matériels et équipements" for theme in metier["themes"])

    administratif = get_audit_template_preset("CIS-AUDIT-ADMIN")
    assert administratif is not None
    assert administratif["audit_type"] == "Administratif"
    assert any(
        question["attachment_required"]
        for theme in administratif["themes"]
        for question in theme["questions"]
    )


def test_missing_audit_template_preset_codes_is_idempotent():
    missing = missing_audit_template_preset_codes({"CIS-AUDIT-HSE"})

    assert missing == ["CIS-AUDIT-ADMIN", "CIS-AUDIT-METIER"]
    assert missing_audit_template_preset_codes({
        "CIS-AUDIT-ADMIN",
        "CIS-AUDIT-HSE",
        "CIS-AUDIT-METIER",
    }) == []
