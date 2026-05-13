"""Test the _build_translator helper for PDF templates i18n.

These tests are pure Python with monkeypatch — they don't need a DB or migration,
so they run unconditionally without the RBAC_PR_B_TEMPLATES_SEEDED gate.
"""
import pytest

from app.core.pdf_templates import _build_translator


def test_translator_returns_function():
    """_build_translator returns a callable that translates keys."""
    t = _build_translator("fr")
    assert callable(t)


def test_translator_falls_back_to_key_if_no_translation(monkeypatch):
    """If the key is not found, the translator returns the key itself.

    This is the graceful fallback: a missing translation must never break
    a PDF render — the canonical token surfaces in place of a translation.
    """
    from app.core import pdf_templates

    monkeypatch.setattr(
        pdf_templates, "_lookup_translation", lambda key, lang: None
    )
    t = _build_translator("fr")
    assert t("UNKNOWN_KEY") == "UNKNOWN_KEY"


def test_translator_returns_translation(monkeypatch):
    """Returns the translation string when the cache has the key."""
    from app.core import pdf_templates

    translations = {("RBAC_GENERATED_AT", "fr"): "Généré le"}
    monkeypatch.setattr(
        pdf_templates,
        "_lookup_translation",
        lambda key, lang: translations.get((key, lang)),
    )
    t = _build_translator("fr")
    assert t("RBAC_GENERATED_AT") == "Généré le"


def test_translator_is_language_scoped(monkeypatch):
    """A translator built for `fr` must not return the `en` value."""
    from app.core import pdf_templates

    translations = {
        ("RBAC_BY", "fr"): "Par",
        ("RBAC_BY", "en"): "By",
    }
    monkeypatch.setattr(
        pdf_templates,
        "_lookup_translation",
        lambda key, lang: translations.get((key, lang)),
    )
    t_fr = _build_translator("fr")
    t_en = _build_translator("en")
    assert t_fr("RBAC_BY") == "Par"
    assert t_en("RBAC_BY") == "By"


def test_clear_translation_cache_full():
    """_clear_translation_cache() with no arg drops every language."""
    from app.core import pdf_templates

    pdf_templates._TRANSLATION_CACHE["fr"] = {"X": "x"}
    pdf_templates._TRANSLATION_CACHE["en"] = {"X": "x"}
    pdf_templates._clear_translation_cache()
    assert pdf_templates._TRANSLATION_CACHE == {}


def test_clear_translation_cache_single_language():
    """_clear_translation_cache('fr') drops only that language."""
    from app.core import pdf_templates

    pdf_templates._TRANSLATION_CACHE["fr"] = {"X": "x"}
    pdf_templates._TRANSLATION_CACHE["en"] = {"X": "x"}
    pdf_templates._clear_translation_cache("fr")
    assert "fr" not in pdf_templates._TRANSLATION_CACHE
    assert pdf_templates._TRANSLATION_CACHE["en"] == {"X": "x"}
    # cleanup
    pdf_templates._clear_translation_cache()


def test_clear_translation_cache_unknown_language_is_noop():
    """_clear_translation_cache('xx') on a non-cached language must not raise."""
    from app.core import pdf_templates

    pdf_templates._clear_translation_cache()  # ensure empty
    pdf_templates._clear_translation_cache("xx")  # must not raise
    assert pdf_templates._TRANSLATION_CACHE == {}
