from types import SimpleNamespace

from app.api.routes.core import attachments


def test_same_hash_is_duplicate_even_with_different_name():
    existing = SimpleNamespace(
        original_name="certificate.pdf",
        category="training",
        file_hash_sha256="abc123",
    )

    assert attachments._is_duplicate_attachment_candidate(
        existing,
        original_name="renamed.pdf",
        file_hash_sha256="abc123",
        category="training",
    )


def test_same_name_different_category_is_not_duplicate():
    existing = SimpleNamespace(
        original_name="certificate.pdf",
        category="training",
        file_hash_sha256="abc123",
    )

    assert not attachments._is_duplicate_attachment_candidate(
        existing,
        original_name="certificate.pdf",
        file_hash_sha256="abc123",
        category="identity",
    )

